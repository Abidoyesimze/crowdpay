const VALID_ROLES = ['owner', 'manager', 'editor', 'viewer'];

const ROLE_RANK = {
  owner: 4,
  manager: 3,
  editor: 2,
  viewer: 1,
};

function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

function canPostUpdates(role) {
  return role === 'owner' || role === 'manager';
}

function canEditCampaignContent(role) {
  return role === 'owner' || role === 'editor';
}

function canViewAnalytics(role) {
  return role === 'owner' || role === 'manager' || role === 'viewer';
}

function canManageMembers(role) {
  return role === 'owner' || role === 'manager';
}

function canInviteMembers(role) {
  return role === 'owner' || role === 'manager';
}

function canChangeRoles(role) {
  return role === 'owner';
}

/**
 * Whether an actor with `actorRole` may grant `targetRole` to a member.
 * Only owners may grant the `owner` role — this prevents a manager from
 * escalating privileges by inviting a brand-new owner. Managers may still
 * invite managers, editors, and viewers.
 */
function canAssignRole(actorRole, targetRole) {
  if (!isValidRole(targetRole)) return false;
  if (targetRole === 'owner') return actorRole === 'owner';
  return canInviteMembers(actorRole);
}

function canSubmitMilestones(role) {
  return role === 'owner' || role === 'manager';
}

function canDeleteCampaign(role) {
  return role === 'owner';
}

module.exports = {
  VALID_ROLES,
  ROLE_RANK,
  isValidRole,
  canPostUpdates,
  canEditCampaignContent,
  canViewAnalytics,
  canManageMembers,
  canInviteMembers,
  canChangeRoles,
  canAssignRole,
  canSubmitMilestones,
  canDeleteCampaign,
};
