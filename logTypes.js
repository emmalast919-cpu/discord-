// Definitions for every log category & granular log type the bot supports.
// Structure: category -> { key, label, icon, types: [{ key, label, description }] }
// `key` on a leaf type is what's stored in the database (globally unique).
// `icon` matches the id of a <symbol> in the website's icons.svg sprite.
const CATEGORIES = [
  {
    key: "applications",
    label: "Applications",
    icon: "automod",
    types: [
      { key: "app_add", label: "App Add", description: "A new application/bot integration was added" },
      { key: "app_remove", label: "App Remove", description: "An application/bot integration was removed" },
      { key: "app_permission_update", label: "App Command Permission Update", description: "Slash command permissions changed" },
    ],
  },
  {
    key: "channels",
    label: "Channels",
    icon: "channel",
    types: [
      { key: "channel_create", label: "Channel Create", description: "A channel was created" },
      { key: "channel_delete", label: "Channel Delete", description: "A channel was deleted" },
      { key: "channel_pins_update", label: "Channel Pins Update", description: "A message was pinned/unpinned" },
      { key: "channel_name_update", label: "Channel Name Update", description: "A channel was renamed" },
      { key: "channel_topic_update", label: "Channel Topic Update", description: "A channel topic changed" },
      { key: "channel_nsfw_update", label: "Channel NSFW Update", description: "NSFW flag toggled" },
      { key: "channel_parent_update", label: "Channel Parent Update", description: "Channel moved to a different category" },
      { key: "channel_permissions_update", label: "Channel Permissions Update", description: "Permission overwrites changed" },
      { key: "channel_type_update", label: "Channel Type Update", description: "Channel type changed" },
      { key: "channel_bitrate_update", label: "Channel Bitrate Update", description: "Voice channel bitrate changed" },
      { key: "channel_user_limit_update", label: "Channel User Limit Update", description: "Voice channel user limit changed" },
      { key: "channel_slowmode_update", label: "Channel Slow Mode Update", description: "Slowmode changed" },
      { key: "channel_rtc_region_update", label: "Channel RTC Region Update", description: "Voice region changed" },
      { key: "channel_video_quality_update", label: "Channel Video Quality Update", description: "Video quality mode changed" },
    ],
  },
  {
    key: "threads",
    label: "Threads",
    icon: "thread",
    types: [
      { key: "thread_create", label: "Thread Create", description: "A thread was created" },
      { key: "thread_delete", label: "Thread Delete", description: "A thread was deleted" },
      { key: "thread_update", label: "Thread Update", description: "A thread was renamed or edited" },
      { key: "thread_archive", label: "Thread Archived", description: "A thread was archived" },
      { key: "thread_unarchive", label: "Thread Unarchived", description: "A thread was unarchived" },
    ],
  },
  {
    key: "automod",
    label: "Discord AutoMod",
    icon: "automod",
    types: [
      { key: "automod_rule_create", label: "AutoMod Rule Create", description: "A rule was created" },
      { key: "automod_rule_delete", label: "AutoMod Rule Delete", description: "A rule was deleted" },
      { key: "automod_rule_toggle", label: "AutoMod Rule Toggle", description: "A rule was enabled/disabled" },
      { key: "automod_rule_name_update", label: "AutoMod Rule Name Update", description: "A rule was renamed" },
      { key: "automod_rule_actions_update", label: "AutoMod Rule Actions Update", description: "A rule's actions changed" },
      { key: "automod_rule_content_update", label: "AutoMod Rule Content Update", description: "A rule's trigger content changed" },
      { key: "automod_rule_roles_update", label: "AutoMod Rule Roles Update", description: "Exempt roles changed" },
      { key: "automod_rule_channels_update", label: "AutoMod Rule Channels Update", description: "Exempt channels changed" },
      { key: "automod_rule_whitelist_update", label: "AutoMod Rule Whitelist Update", description: "Allow list changed" },
      { key: "automod_action_execution", label: "AutoMod Action Taken", description: "A message/user was actioned" },
    ],
  },
  {
    key: "emojis",
    label: "Emojis",
    icon: "emoji",
    types: [
      { key: "emoji_create", label: "Emoji Create", description: "An emoji was added" },
      { key: "emoji_delete", label: "Emoji Delete", description: "An emoji was removed" },
      { key: "emoji_name_update", label: "Emoji Name Update", description: "An emoji was renamed" },
      { key: "emoji_roles_update", label: "Emoji Roles Update", description: "Emoji role restrictions changed" },
    ],
  },
  {
    key: "events",
    label: "Events",
    icon: "event",
    types: [
      { key: "event_create", label: "Event Create", description: "A scheduled event was created" },
      { key: "event_delete", label: "Event Delete", description: "A scheduled event was deleted" },
      { key: "event_location_update", label: "Event Location Update", description: "Event location changed" },
      { key: "event_description_update", label: "Event Description Update", description: "Event description changed" },
      { key: "event_name_update", label: "Event Name Update", description: "Event name changed" },
      { key: "event_privacy_update", label: "Event Privacy Level Update", description: "Privacy level changed" },
      { key: "event_start_time_update", label: "Event Start Time Update", description: "Start time changed" },
      { key: "event_end_time_update", label: "Event End Time Update", description: "End time changed" },
      { key: "event_status_update", label: "Event Status Update", description: "Event status changed" },
      { key: "event_image_update", label: "Event Image Update", description: "Cover image changed" },
      { key: "event_user_subscribe", label: "Event User Subscribe", description: "Someone marked interested" },
      { key: "event_user_unsubscribe", label: "Event User Unsubscribe", description: "Someone removed interest" },
    ],
  },
  {
    key: "invites",
    label: "Invites",
    icon: "invite",
    types: [
      { key: "invite_create", label: "Invite Create", description: "An invite link was created" },
      { key: "invite_delete", label: "Invite Delete", description: "An invite link was deleted/expired" },
      { key: "invite_post", label: "Invite Post", description: "An invite link was shared in chat" },
    ],
  },
  {
    key: "messages",
    label: "Messages",
    icon: "message",
    types: [
      { key: "message_delete", label: "Message Delete", description: "A message was deleted" },
      { key: "message_edit", label: "Message Edit", description: "A message was edited" },
      { key: "message_bulk_delete", label: "Message Bulk Delete", description: "Messages were purged" },
    ],
  },
  {
    key: "roles",
    label: "Roles",
    icon: "role",
    types: [
      { key: "role_create", label: "Role Create", description: "A role was created" },
      { key: "role_delete", label: "Role Delete", description: "A role was deleted" },
      { key: "role_update", label: "Role Update", description: "A role's name/color/permissions changed" },
      { key: "member_role_update", label: "Member Role Update", description: "A member's roles changed" },
    ],
  },
  {
    key: "stickers",
    label: "Stickers",
    icon: "sticker",
    types: [
      { key: "sticker_create", label: "Sticker Create", description: "A sticker was added" },
      { key: "sticker_delete", label: "Sticker Delete", description: "A sticker was removed" },
      { key: "sticker_name_update", label: "Sticker Name Update", description: "A sticker was renamed" },
    ],
  },
  {
    key: "voice",
    label: "Voice",
    icon: "voice",
    types: [
      { key: "voice_join", label: "Voice Join", description: "A member joined a voice channel" },
      { key: "voice_leave", label: "Voice Leave", description: "A member left a voice channel" },
      { key: "voice_move", label: "Voice Move", description: "A member moved voice channels" },
    ],
  },
  {
    key: "boosts",
    label: "Boosts",
    icon: "boost",
    types: [
      { key: "boost_add", label: "Boost Add", description: "A member started boosting" },
      { key: "boost_remove", label: "Boost Remove", description: "A member stopped boosting" },
    ],
  },
  {
    key: "moderation",
    label: "Moderation",
    icon: "mod",
    types: [
      { key: "ban_add", label: "Ban Add", description: "A member was banned" },
      { key: "ban_remove", label: "Ban Remove", description: "A member was unbanned" },
      { key: "member_kick", label: "Member Kick", description: "A member was kicked" },
      { key: "member_timeout", label: "Member Timeout", description: "A member was timed out" },
    ],
  },
  {
    key: "server",
    label: "Server",
    icon: "server",
    types: [
      { key: "member_join", label: "User Join", description: "A member joined the server" },
      { key: "member_leave", label: "User Leave", description: "A member left the server" },
      { key: "member_prune", label: "Member Prune", description: "Inactive members were pruned" },
      { key: "afk_channel_update", label: "AFK Channel Update", description: "AFK channel changed" },
      { key: "afk_timeout_update", label: "AFK Timeout Update", description: "AFK timeout changed" },
      { key: "server_banner_update", label: "Server Banner Update", description: "Server banner changed" },
      { key: "notifications_update", label: "Message Notifications Update", description: "Default notification setting changed" },
      { key: "discovery_splash_update", label: "Server Discovery Splash Update", description: "Discovery splash changed" },
      { key: "content_filter_update", label: "Server Content Filter Level Update", description: "Explicit content filter changed" },
      { key: "server_features_update", label: "Server Features Update", description: "Server feature flags changed" },
      { key: "server_icon_update", label: "Server Icon Update", description: "Server icon changed" },
      { key: "mfa_level_update", label: "MFA Level Update", description: "Moderator 2FA requirement changed" },
      { key: "server_name_update", label: "Server Name Update", description: "Server name changed" },
      { key: "server_description_update", label: "Server Description Update", description: "Server description changed" },
      { key: "server_owner_update", label: "Server Owner Update", description: "Server ownership transferred" },
      { key: "boost_progress_bar_toggle", label: "Boost Progress Bar Toggle", description: "Boost progress bar visibility toggled" },
      { key: "public_updates_channel_update", label: "Public Updates Channel Update", description: "Community updates channel changed" },
      { key: "rules_channel_update", label: "Server Rules Channel Update", description: "Rules channel changed" },
      { key: "server_splash_update", label: "Server Splash Update", description: "Invite splash image changed" },
      { key: "system_channel_update", label: "System Channel Update", description: "System messages channel changed" },
      { key: "vanity_update", label: "Server Vanity Update", description: "Vanity invite URL changed" },
      { key: "verification_level_update", label: "Verification Level Update", description: "Verification level changed" },
      { key: "server_widget_update", label: "Server Widget Update", description: "Server widget setting changed" },
      { key: "preferred_locale_update", label: "Server Preferred Locale Update", description: "Preferred locale changed" },
      { key: "onboarding_toggle", label: "Onboarding Toggle", description: "Onboarding enabled/disabled" },
    ],
  },
];

const LEAF_TYPES = [];
const CATEGORY_OF = {};
for (const cat of CATEGORIES) {
  for (const t of cat.types) {
    LEAF_TYPES.push({ ...t, category: cat.key, categoryLabel: cat.label, icon: cat.icon });
    CATEGORY_OF[t.key] = cat.key;
  }
}

function categoryOf(logType) {
  return CATEGORY_OF[logType] || null;
}

module.exports = { CATEGORIES, LEAF_TYPES, categoryOf };
