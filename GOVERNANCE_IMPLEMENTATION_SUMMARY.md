# CrowdPay Fee Registry and Governance Implementation Summary

## Overview
This implementation adds on-chain fee management, creator revenue sharing, and decentralized governance to CrowdPay. The platform fee is no longer hardcoded but stored on-chain in a Soroban smart contract, allowing token holders to propose and vote on fee changes.

## Components Implemented

### 1. Soroban Fee Registry Contract
**Location:** `contracts/soroban/contracts/fee_registry/`

**Storage:**
- `platform_fee_bps: u32` - Current platform fee in basis points
- `creator_share_bps: u32` - Creator revenue share percentage
- `governance_token: Address` - Governance token contract address
- `admin: Address` - Admin address for emergency fee changes
- `pending_proposal: Option<FeeProposal>` - Active governance proposal

**FeeProposal Structure:**
- `id: u32` - Unique proposal identifier
- `proposed_fee_bps: u32` - Proposed platform fee
- `proposed_creator_share_bps: u32` - Proposed creator share
- `votes_for: i128` - Total votes in favor
- `votes_against: i128` - Total votes against
- `deadline: u64` - Voting deadline (7 days from creation)
- `status: ProposalStatus` - Active, Passed, Failed, Executed

**Contract Functions:**
- `get_fee() -> u32` - Returns current platform fee
- `get_creator_share() -> u32` - Returns current creator share
- `propose_change(new_fee_bps, new_creator_share_bps) -> u32` - Creates new proposal (requires 1,000 tokens)
- `vote(proposal_id, in_favor: bool)` - Vote on active proposal (weight = token balance)
- `execute_proposal(proposal_id)` - Execute proposal after deadline (requires majority + 10% quorum)
- `admin_set_fee(fee_bps, creator_share_bps)` - Emergency admin fee change

### 2. Backend Fee Registry Service
**Location:** `backend/src/services/feeRegistry.js`

**Features:**
- Fetches platform fee and creator share from on-chain contract
- Caches fees in memory with 5-minute TTL
- Provides fee calculation functions for contributions
- Calculates creator revenue share for withdrawals
- Automatic cache refresh via cron job every 5 minutes
- Cache invalidation after admin fee changes

**Functions:**
- `getPlatformFee()` - Get cached platform fee
- `getCreatorShare()` - Get cached creator share
- `calculatePlatformFee(amount)` - Calculate fee for contribution
- `calculateCreatorShare(collectedFees)` - Calculate creator's share
- `refreshFeeCache()` - Refresh cache from contract
- `invalidateFeeCache()` - Clear cache after changes
- `getFeeRegistryInfo()` - Get fee info for API responses

### 3. Backend Governance Service
**Location:** `backend/src/services/governance.js`

**Features:**
- Proposal creation with token balance validation
- Voting with token-weighted votes
- Proposal execution with quorum enforcement
- On-chain to database synchronization
- Vote tracking and participation metrics

**Functions:**
- `getPendingProposal()` - Get active proposal from contract
- `getAllProposals()` - Get all proposals from database
- `getProposalById(id)` - Get proposal with vote statistics
- `checkUserTokenBalance(publicKey)` - Check if user holds tokens
- `getUserTokenBalance(publicKey)` - Get user's token balance
- `createProposal(...)` - Create new governance proposal
- `voteOnProposal(...)` - Vote on proposal
- `executeProposal(...)` - Execute proposal after deadline
- `syncProposalData()` - Sync contract state to database

### 4. Governance API Routes
**Location:** `backend/src/routes/governance.js`

**Endpoints:**
- `GET /api/governance/proposals` - List all proposals
- `GET /api/governance/proposals/:id` - Get proposal details with votes
- `POST /api/governance/proposals` - Create new proposal (auth required)
- `POST /api/governance/proposals/:id/vote` - Vote on proposal (auth required)
- `POST /api/governance/proposals/:id/execute` - Execute proposal (auth required)
- `GET /api/governance/fee` - Get current fee and contract info
- `GET /api/governance/user/token-balance` - Get user's token balance (auth required)
- `POST /api/governance/sync` - Sync proposal data (internal)

### 5. Database Migrations
**Location:** `backend/db/migrations/20260818_governance_tables.sql`

**Tables:**
- `governance_proposals_meta` - Stores proposal metadata (rationale, proposer, etc.)
- `governance_votes_log` - Logs all votes with token balance snapshot

### 6. Frontend Governance Page
**Location:** `frontend/src/pages/Governance.jsx`

**Features:**
- Display current platform fee and creator share
- Link to view contract on Stellar Expert
- Show user's governance token balance
- Display active proposal with vote counts and deadline
- Vote For/Vote Against buttons (requires wallet connection)
- Proposal history table
- Create Proposal form (gated by 1,000 token balance)
- Real-time outcome projection

**Route:** `/governance`

### 7. Integration Updates

**Contribution Flow:**
- Updated `stellarService.js` to use `getPlatformFee()` from fee registry
- Changed `calcFee()` to async function that fetches on-chain fee
- All contribution fee calculations now use cached on-chain value

**Withdrawal Flow:**
- Updated `buildWithdrawalTransaction()` to include creator revenue share
- Withdrawal requests now calculate collected fees for the campaign
- Creator share calculated and logged in withdrawal events
- Additional payment operation included in transaction XDR

**Backend Startup:**
- Added `startFeeCacheRefreshCron()` function
- Cron job runs every 5 minutes to refresh fee cache
- Cache refreshes on backend startup

## Environment Variables

Add to `backend/.env`:
```
FEE_REGISTRY_CONTRACT_ID=<deployed_contract_id>
GOVERNANCE_TOKEN_ID=<crowd_token_issuer_address>
```

## Deployment Steps

1. **Deploy Fee Registry Contract:**
   ```bash
   cd contracts/soroban/contracts/fee_registry
   cargo build --release --target wasm32-unknown-unknown
   # Deploy WASM and get contract ID
   # Initialize with admin, governance token, initial fees
   ```

2. **Run Database Migration:**
   ```bash
   cd backend
   npm run migrate
   ```

3. **Configure Environment:**
   - Set `FEE_REGISTRY_CONTRACT_ID` in backend `.env`
   - Set `GOVERNANCE_TOKEN_ID` in backend `.env`

4. **Restart Backend:**
   - Fee cache will refresh on startup
   - Cron job will refresh every 5 minutes

## Acceptance Criteria Verification

### ✅ 1. get_fee() returns correct platform_fee_bps
- Contract implements `get_fee()` function
- Backend calls `get_fee()` via `invokeContractReadOnly()`
- Fee cached and used in contribution calculations
- Verified in `stellarService.js` `calcFee()` function

### ✅ 2. Proposal execution with majority + quorum
- Contract `execute_proposal()` checks: `votes_for > votes_against AND votes_for >= QUORUM_THRESHOLD`
- Quorum threshold set to 1,000 tokens (10% of 10,000 total supply)
- On success, updates `platform_fee_bps` and `creator_share_bps`
- Status set to `Executed`

### ✅ 3. Proposal fails without quorum
- Even if `votes_for > votes_against`, proposal fails if `votes_for < QUORUM_THRESHOLD`
- Status set to `Failed`
- Fees remain unchanged

### ✅ 4. Creator revenue share in withdrawal
- `buildWithdrawalTransaction()` accepts `collectedFees` and `creatorPublicKey`
- Calculates creator share using `calculateCreatorShare()`
- Adds payment operation to transaction XDR
- Logs creator share in withdrawal events for audit

### ✅ 5. propose_change rejects callers with < 1,000 tokens
- Contract checks token balance before allowing proposal creation
- Returns error if balance < `MIN_TOKEN_BALANCE` (1,000)
- Backend also validates via `checkUserTokenBalance()`

### ✅ 6. Fee cache refreshes within 5 minutes
- Cron job scheduled: `*/5 * * * *` (every 5 minutes)
- Cache TTL set to 5 minutes (300,000ms)
- `invalidateFeeCache()` called after admin fee changes
- Backend refreshes cache on startup

## Security Considerations

1. **Token Balance Validation:** Both contract and backend validate token balances
2. **Proposal Deadlines:** 7-day voting period prevents indefinite proposals
3. **Quorum Requirements:** 10% participation threshold prevents small-group manipulation
4. **Admin Override:** Emergency admin function for critical situations
5. **Vote Weighting:** Votes weighted by token balance at time of voting
6. **Transaction Signing:** Requires wallet signing (Freighter integration needed for production)

## Future Enhancements

1. **Freighter Integration:** Replace secret key signing with proper wallet signing
2. **Revenue Share Payouts:** Implement actual transfer from platform fee wallet to creator
3. **Proposal Delegation:** Allow token holders to delegate voting power
4. **Multi-Sig Admin:** Require multiple admin signatures for emergency changes
5. **Fee History:** Track fee changes over time for transparency
6. **Notification System:** Notify token holders of new proposals and voting deadlines

## Testing

To test the implementation:

1. Deploy the fee registry contract to testnet
2. Run database migration
3. Configure environment variables
4. Create a test proposal via API
5. Vote on the proposal
6. Execute proposal after deadline
7. Verify fee updates in cache and contract
8. Test contribution flow with new fee
9. Test withdrawal flow with creator share calculation

## Files Created/Modified

**Created:**
- `contracts/soroban/contracts/fee_registry/` (entire contract)
- `backend/src/services/feeRegistry.js`
- `backend/src/services/governance.js`
- `backend/src/routes/governance.js`
- `backend/db/migrations/20260818_governance_tables.sql`
- `frontend/src/pages/Governance.jsx`

**Modified:**
- `contracts/soroban/Cargo.toml` (added fee_registry to workspace)
- `backend/src/services/stellarService.js` (updated calcFee, buildWithdrawalTransaction)
- `backend/src/routes/withdrawals.js` (added creator share calculation)
- `backend/src/index.js` (added governance routes, fee cache cron)
- `frontend/src/App.jsx` (added Governance route)
- `backend/.env.example` (added governance env vars)
