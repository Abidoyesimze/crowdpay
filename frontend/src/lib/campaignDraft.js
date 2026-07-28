const STORAGE_KEY = 'crowdpay:campaign_draft';

// Drafts are a convenience, not a record — anything older than a week is more
// likely to confuse a creator than help them.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const IGNORED_FIELDS = new Set(['asset_type', 'show_backer_amounts']);

/**
 * Whether a form holds anything worth restoring. Defaults the creator never
 * touched (asset type, backer visibility) do not count.
 */
export function hasDraftContent(form) {
  if (!form) return false;
  return Object.entries(form).some(([field, value]) => {
    if (IGNORED_FIELDS.has(field)) return false;
    if (Array.isArray(value)) return value.length > 0;
    return typeof value === 'string' ? value.trim() !== '' : Boolean(value);
  });
}

export function saveDraft(form, step) {
  if (!hasDraftContent(form)) return null;
  const draft = { form, step, saved_at: new Date().toISOString() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    return draft;
  } catch {
    // storage unavailable (private browsing, quota) — skip silently
    return null;
  }
}

export function loadDraft() {
  let draft;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    draft = raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }

  if (!draft || typeof draft !== 'object' || !draft.form) return null;
  if (!hasDraftContent(draft.form)) return null;

  const savedAt = Date.parse(draft.saved_at);
  if (Number.isNaN(savedAt) || Date.now() - savedAt > MAX_AGE_MS) {
    clearDraft();
    return null;
  }

  return draft;
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable — nothing to clean up
  }
}
