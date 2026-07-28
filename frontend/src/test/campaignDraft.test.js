import { describe, it, expect, beforeEach } from 'vitest';
import { saveDraft, loadDraft, clearDraft, hasDraftContent } from '../lib/campaignDraft';

const STORAGE_KEY = 'crowdpay:campaign_draft';

const EMPTY_FORM = {
  title: '',
  description: '',
  target_amount: '',
  asset_type: 'USDC',
  deadline: '',
  category: '',
  show_backer_amounts: true,
  milestones: [],
  reward_tiers: [],
};

describe('campaignDraft', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('treats an untouched form as having nothing to restore', () => {
    expect(hasDraftContent(EMPTY_FORM)).toBe(false);
    expect(saveDraft(EMPTY_FORM, 1)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('saves and restores a form with content', () => {
    const form = { ...EMPTY_FORM, title: 'Solar grid', target_amount: '500' };

    const saved = saveDraft(form, 2);

    expect(saved.saved_at).toBeTruthy();
    expect(loadDraft()).toEqual({ form, step: 2, saved_at: saved.saved_at });
  });

  it('counts a filled milestone list as content', () => {
    const form = {
      ...EMPTY_FORM,
      milestones: [{ title: 'Prototype', description: '', release_percentage: '50' }],
    };

    expect(hasDraftContent(form)).toBe(true);
    expect(saveDraft(form, 3)).not.toBeNull();
  });

  it('drops drafts older than a week', () => {
    const staleDraft = {
      form: { ...EMPTY_FORM, title: 'Old idea' },
      step: 1,
      saved_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(staleDraft));

    expect(loadDraft()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('ignores unparseable or malformed storage entries', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json');
    expect(loadDraft()).toBeNull();

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ step: 1 }));
    expect(loadDraft()).toBeNull();
  });

  it('clears a stored draft', () => {
    saveDraft({ ...EMPTY_FORM, title: 'Solar grid' }, 1);

    clearDraft();

    expect(loadDraft()).toBeNull();
  });
});
