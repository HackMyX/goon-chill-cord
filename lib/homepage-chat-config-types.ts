// Shared types and defaults for homepage chat config.
// NOT "use server" — imported by both client components and the server action.

export interface HomepageChatConfig {
  id: string;
  enabled: boolean;
  defaultOpenDesktop: boolean;
  defaultOpenMobile: boolean;
  sidebarWidth: number;
  sidebarPosition: string;
  bgOpacity: number;
  blurIntensity: string;
  showAvatars: boolean;
  showBadges: boolean;
  showTimestamps: boolean;
  showTimestampsRelative: boolean;
  showInput: boolean;
  maxMessages: number;
  maxBadgeCount: number;
  fontSize: string;
  messageAnimation: boolean;
  inputPlaceholder: string;
  tabTitle: string;
  headerVisible: boolean;
  showOnlineCount: boolean;
  compactMode: boolean;
  highlightMentions: boolean;
  mentionSound: boolean;
  autoScroll: boolean;
  updatedAt: string | null;
}

export const DEFAULT_HOMEPAGE_CHAT_CONFIG: HomepageChatConfig = {
  id: "default",
  enabled: true,
  defaultOpenDesktop: true,
  defaultOpenMobile: false,
  sidebarWidth: 320,
  sidebarPosition: "left",
  bgOpacity: 20,
  blurIntensity: "md",
  showAvatars: true,
  showBadges: true,
  showTimestamps: true,
  showTimestampsRelative: true,
  showInput: true,
  maxMessages: 50,
  maxBadgeCount: 3,
  fontSize: "sm",
  messageAnimation: true,
  inputPlaceholder: "Nachricht...",
  tabTitle: "Community Chat",
  headerVisible: true,
  showOnlineCount: true,
  compactMode: false,
  highlightMentions: true,
  mentionSound: false,
  autoScroll: true,
  updatedAt: null,
};
