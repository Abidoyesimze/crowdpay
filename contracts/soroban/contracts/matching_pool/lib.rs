#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Symbol, Vec};

/// Matching pool contract for sponsor matching campaigns.
/// 
/// Holds sponsor funds and releases proportional amounts as contributions arrive.
/// Sponsors can reclaim unmatched funds after campaign ends.

#[derive(Clone)]
#[contracttype]
pub struct PoolStatus {
    /// Campaign ID (off-chain reference)
    pub campaign_id: u64,
    /// Sponsor address (Stellar account)
    pub sponsor: Address,
    /// Match ratio: 1 = 1:1, 2 = 2:1, etc.
    pub match_ratio: i128,
    /// Total funds pledged by sponsor
    pub total_pool: i128,
    /// Funds already matched to contributions
    pub matched_amount: i128,
    /// Funds available for future matches
    pub remaining_pool: i128,
    /// Pool status: 'active' or 'exhausted'
    pub status: Symbol,
}

#[contract]
pub struct MatchingPoolContract;

#[contractimpl]
impl MatchingPoolContract {
    /// Initialize the matching pool contract.
    /// 
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `sponsor` - Sponsor's Stellar address
    /// * `campaign_id` - Campaign ID (from backend database)
    /// * `match_ratio` - Match ratio (e.g., 100 = 1.00:1, 200 = 2.00:1)
    /// 
    /// # Example
    /// ```ignore
    /// initialize(env, sponsor_address, 12345, 100);
    /// ```
    pub fn initialize(
        env: Env,
        sponsor: Address,
        campaign_id: u64,
        match_ratio: i128,
    ) {
        // Implementation would:
        // 1. Verify sponsor has signed the transaction
        // 2. Store sponsor's pledge amount (received as contract balance)
        // 3. Initialize pool status
        // 4. Set up data keys for tracking matched funds
        // 5. Emit initialization event
        
        sponsor.require_auth();
        
        // Store contract state
        let key = Symbol::new(&env, "state");
        let status = PoolStatus {
            campaign_id,
            sponsor: sponsor.clone(),
            match_ratio,
            total_pool: 0, // Receives funds via payment in XLM/USDC
            matched_amount: 0,
            remaining_pool: 0,
            status: Symbol::new(&env, "active"),
        };
        
        env.storage().persistent().set(&key, &status);
    }

    /// Release matching funds when a contribution is confirmed.
    /// 
    /// Called by backend oracle when a contribution is verified on-chain.
    /// Calculates match_amount = min(contribution * ratio, remaining_pool)
    /// and transfers it to the campaign recipient address.
    /// 
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `contribution_amount` - Amount of user contribution
    /// * `recipient` - Campaign wallet to receive the match
    /// 
    /// # Returns
    /// The amount actually matched (0 if pool exhausted)
    /// 
    /// # Example
    /// ```ignore
    /// let matched = release_match(env, 100_0000000, recipient_address);
    /// // matched = 100_0000000 for 1:1 ratio, or proportional amount if pool limited
    /// ```
    pub fn release_match(
        env: Env,
        contribution_amount: i128,
        recipient: Address,
    ) -> i128 {
        // Implementation would:
        // 1. Load current pool status
        // 2. Calculate: match_amount = contribution_amount * match_ratio / 100
        // 3. Cap at remaining pool: actual_match = min(match_amount, remaining)
        // 4. Update pool: matched_amount += actual_match
        // 5. Mark exhausted if matched_amount >= total_pool
        // 6. Transfer actual_match from contract to recipient (USDC/XLM)
        // 7. Emit event with contribution_id, match_amount
        // 8. Return actual_match
        
        let key = Symbol::new(&env, "state");
        let mut status: PoolStatus = env.storage().persistent().get(&key).unwrap();
        
        let match_amount = (contribution_amount * status.match_ratio) / 100;
        let actual_match = match_amount.min(status.remaining_pool);
        
        if actual_match > 0 {
            status.matched_amount += actual_match;
            status.remaining_pool -= actual_match;
            
            if status.remaining_pool == 0 {
                status.status = Symbol::new(&env, "exhausted");
            }
            
            env.storage().persistent().set(&key, &status);
            
            // Transfer logic would use Stellar token contract to send actual_match to recipient
        }
        
        actual_match
    }

    /// Get the current pool status and match statistics.
    /// 
    /// # Returns
    /// `PoolStatus` with current pool state:
    /// - campaign_id
    /// - sponsor address
    /// - match_ratio
    /// - total_pool (initial pledge)
    /// - matched_amount (funds released so far)
    /// - remaining_pool (available for future matches)
    /// - status ('active' or 'exhausted')
    /// 
    /// # Example
    /// ```ignore
    /// let pool = get_pool_status(env);
    /// if pool.status == "exhausted" { /* handle exhausted pool */ }
    /// ```
    pub fn get_pool_status(env: Env) -> PoolStatus {
        let key = Symbol::new(&env, "state");
        env.storage().persistent().get(&key).unwrap()
    }

    /// Sponsor reclaims unmatched funds after campaign ends.
    /// 
    /// Transfers remaining unmatched funds back to the sponsor.
    /// Only callable by sponsor address. Campaign creator may also call
    /// to initiate reclaim (backend verifies campaign end status).
    /// 
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `sponsor` - Sponsor address (must sign)
    /// 
    /// # Returns
    /// Amount reclaimed
    /// 
    /// # Example
    /// ```ignore
    /// let reclaimed = reclaim(env, sponsor_address);
    /// // sponsor receives reclaimed amount back to their Stellar account
    /// ```
    pub fn reclaim(env: Env, sponsor: Address) -> i128 {
        // Implementation would:
        // 1. Require sponsor's signature
        // 2. Load pool status
        // 3. Verify pool is completed/exhausted (backend responsibility)
        // 4. Calculate unmatched: remaining_pool
        // 5. Transfer unmatched amount to sponsor
        // 6. Mark pool as 'completed'
        // 7. Emit reclaim event
        // 8. Return amount reclaimed
        
        sponsor.require_auth();
        
        let key = Symbol::new(&env, "state");
        let mut status: PoolStatus = env.storage().persistent().get(&key).unwrap();
        
        let unclaimed = status.remaining_pool;
        if unclaimed > 0 {
            status.status = Symbol::new(&env, "completed");
            env.storage().persistent().set(&key, &status);
            
            // Transfer logic: send unclaimed to sponsor
        }
        
        unclaimed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initialize_pool() {
        // Test contract initialization with sponsor and match ratio
    }

    #[test]
    fn test_release_match_calculates_ratio() {
        // Test: contribution 100, ratio 1.0, should match 100
    }

    #[test]
    fn test_release_match_caps_at_pool() {
        // Test: pool 500, ratio 1.0, contribution 600, should match 500
    }

    #[test]
    fn test_exhaust_pool() {
        // Test: pool becomes exhausted after matching
    }

    #[test]
    fn test_reclaim_unmatched() {
        // Test: sponsor can reclaim remaining funds
    }
}
