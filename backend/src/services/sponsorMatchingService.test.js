const {
  createMatchingPledge,
  processContributionMatch,
  getCampaignMatchProgress,
  completeMatchingPledge,
  getSponsorMatchingPledges,
} = require('./sponsorMatchingService');

// Mock database
const db = require('../config/database');
jest.mock('../config/database');
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('SponsorMatchingService', () => {
  const mockCampaignId = 'campaign-uuid-1';
  const mockSponsorUserId = 'sponsor-uuid-1';
  const mockContributionId = 'contrib-uuid-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createMatchingPledge', () => {
    it('createMatchingPledge_validates_ratio_positive', async () => {
      const invalidParams = {
        campaignId: mockCampaignId,
        sponsorUserId: mockSponsorUserId,
        matchRatio: -1,
        pledgeAmount: '1000',
      };

      await expect(createMatchingPledge(invalidParams)).rejects.toThrow(
        'matchRatio must be positive'
      );
    });

    it('createMatchingPledge_validates_pledge_positive', async () => {
      const invalidParams = {
        campaignId: mockCampaignId,
        sponsorUserId: mockSponsorUserId,
        matchRatio: 1.0,
        pledgeAmount: '0',
      };

      await expect(createMatchingPledge(invalidParams)).rejects.toThrow(
        'pledgeAmount must be positive'
      );
    });

    it('createMatchingPledge_creates_pledge', async () => {
      const mockResult = {
        id: 'match-uuid-1',
        campaign_id: mockCampaignId,
        sponsor_user_id: mockSponsorUserId,
        match_ratio: 1.0,
        pledge_amount: '1000',
        matched_amount: '0',
        status: 'active',
        created_at: new Date(),
      };

      db.query.mockResolvedValueOnce({ rows: [] }); // Check existing
      db.query.mockResolvedValueOnce({ rows: [mockResult] }); // Insert

      const result = await createMatchingPledge({
        campaignId: mockCampaignId,
        sponsorUserId: mockSponsorUserId,
        matchRatio: 1.0,
        pledgeAmount: '1000',
      });

      expect(result).toEqual(mockResult);
      expect(db.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('processContributionMatch', () => {
    it('processContributionMatch_calculates_correct_match_amount', async () => {
      // Pledge 1000, ratio 1.0, contribution 100
      // Assert matched = 100

      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'match-uuid-1',
            match_ratio: 1.0,
            pledge_amount: 1000,
            matched_amount: 0,
          },
        ],
      });

      db.query.mockResolvedValueOnce({ rows: [] }); // Update match
      db.query.mockResolvedValueOnce({ rows: [] }); // Update contribution

      const matchedAmount = await processContributionMatch({
        campaignId: mockCampaignId,
        contributionId: mockContributionId,
        contributionAmount: '100',
      });

      expect(matchedAmount).toBe(100);
    });

    it('processContributionMatch_applies_2to1_ratio', async () => {
      // Pledge 2000, ratio 2.0, contribution 100
      // Assert matched = 200

      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'match-uuid-1',
            match_ratio: 2.0,
            pledge_amount: 2000,
            matched_amount: 0,
          },
        ],
      });

      db.query.mockResolvedValueOnce({ rows: [] }); // Update match
      db.query.mockResolvedValueOnce({ rows: [] }); // Update contribution

      const matchedAmount = await processContributionMatch({
        campaignId: mockCampaignId,
        contributionId: mockContributionId,
        contributionAmount: '100',
      });

      expect(matchedAmount).toBe(200);
    });

    it('processContributionMatch_caps_at_pledge_amount', async () => {
      // Pledge 500, ratio 1.0, contribution 600
      // Assert matched = 500 (not 600), status = 'exhausted'

      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'match-uuid-1',
            match_ratio: 1.0,
            pledge_amount: 500,
            matched_amount: 0,
          },
        ],
      });

      db.query.mockResolvedValueOnce({ rows: [] }); // Update match
      db.query.mockResolvedValueOnce({ rows: [] }); // Update contribution

      const matchedAmount = await processContributionMatch({
        campaignId: mockCampaignId,
        contributionId: mockContributionId,
        contributionAmount: '600',
      });

      expect(matchedAmount).toBe(500);
      // Check that status was updated to 'exhausted'
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("status = $2"),
        expect.arrayContaining(['exhausted'])
      );
    });

    it('processContributionMatch_returns_zero_when_exhausted', async () => {
      // Exhaust pool, then make another contribution
      // Assert returns 0, no further updates

      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'match-uuid-1',
            match_ratio: 1.0,
            pledge_amount: 100,
            matched_amount: 100,
          },
        ],
      });

      db.query.mockResolvedValueOnce({ rows: [] }); // Update match
      db.query.mockResolvedValueOnce({ rows: [] }); // Update contribution

      const matchedAmount = await processContributionMatch({
        campaignId: mockCampaignId,
        contributionId: mockContributionId,
        contributionAmount: '50',
      });

      expect(matchedAmount).toBe(0);
    });

    it('processContributionMatch_returns_zero_when_no_pool', async () => {
      // No active matching pools
      // Assert returns 0

      db.query.mockResolvedValueOnce({ rows: [] }); // No matches

      const matchedAmount = await processContributionMatch({
        campaignId: mockCampaignId,
        contributionId: mockContributionId,
        contributionAmount: '100',
      });

      expect(matchedAmount).toBe(0);
    });
  });

  describe('getCampaignMatchProgress', () => {
    it('getCampaignMatchProgress_aggregates_multiple_sponsors', async () => {
      // Two sponsors: 1000 + 500 pledged, 300 + 100 matched
      // Assert totalPledged = 1500, totalMatched = 400

      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'match-uuid-1',
            sponsor_user_id: 'sponsor-1',
            sponsor_name: 'Sponsor One',
            match_ratio: 1.0,
            pledge_amount: 1000,
            matched_amount: 300,
            status: 'active',
            created_at: new Date(),
            contribution_count: 3,
            total_contributed: 300,
          },
          {
            id: 'match-uuid-2',
            sponsor_user_id: 'sponsor-2',
            sponsor_name: 'Sponsor Two',
            match_ratio: 1.0,
            pledge_amount: 500,
            matched_amount: 100,
            status: 'active',
            created_at: new Date(),
            contribution_count: 1,
            total_contributed: 100,
          },
        ],
      });

      const progress = await getCampaignMatchProgress(mockCampaignId);

      expect(progress.totalPledged).toBe(1500);
      expect(progress.totalMatched).toBe(400);
      expect(progress.remainingPoolAmount).toBe(1100);
      expect(progress.activePoolCount).toBe(2);
      expect(progress.percentageUsed).toBeCloseTo(26.67, 1);
    });

    it('getCampaignMatchProgress_calculates_zero_percentage_when_no_pledge', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const progress = await getCampaignMatchProgress(mockCampaignId);

      expect(progress.totalPledged).toBe(0);
      expect(progress.percentageUsed).toBe(0);
    });
  });

  describe('completeMatchingPledge', () => {
    it('completeMatchingPledge_marks_completed', async () => {
      const mockMatch = {
        id: 'match-uuid-1',
        campaign_id: mockCampaignId,
        sponsor_user_id: mockSponsorUserId,
        pledge_amount: 1000,
        matched_amount: 600,
        status: 'completed',
      };

      db.query.mockResolvedValueOnce({ rows: [mockMatch] });

      const result = await completeMatchingPledge('match-uuid-1');

      expect(result).toEqual(mockMatch);
      expect(result.status).toBe('completed');
    });

    it('completeMatchingPledge_throws_when_not_found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await expect(completeMatchingPledge('invalid-uuid')).rejects.toThrow(
        'Match not found or already completed'
      );
    });
  });

  describe('getSponsorMatchingPledges', () => {
    it('getSponsorMatchingPledges_returns_sponsor_pledges', async () => {
      const mockPledges = [
        {
          id: 'match-uuid-1',
          campaign_id: 'campaign-1',
          campaign_title: 'Campaign A',
          campaign_status: 'active',
          sponsor_user_id: mockSponsorUserId,
          sponsor_name: 'Sponsor',
          match_ratio: 1.0,
          pledge_amount: 1000,
          matched_amount: 300,
          status: 'active',
          contract_id: null,
          created_at: new Date(),
        },
      ];

      db.query.mockResolvedValueOnce({ rows: mockPledges });

      const pledges = await getSponsorMatchingPledges(mockSponsorUserId);

      expect(pledges).toHaveLength(1);
      expect(pledges[0].pledgeAmount).toBe(1000);
      expect(pledges[0].remainingAmount).toBe(700);
    });
  });
});
