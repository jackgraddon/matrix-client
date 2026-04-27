import { defineStore } from 'pinia';
import { setPref } from '~/composables/useAppStorage';

export interface UIState {
  memberListVisible: boolean;
  selectedUserId: string | null;
  profileCardPos: { top: string; right: string; left?: string };
  collapsedCategories: string[];
  showEmptyRooms: boolean;
  // Composer states indexed by roomId
  composerStates: Record<string, {
    replyingTo?: any;
    editingMessage?: any;
    text?: string;
  }>;
  // Sortable sidebar state
  uiOrder: {
    rootSpaces: string[]; // Order of root spaces (pinned + others)
    categories: Record<string, string[]>; // Order of categories per spaceId
    rooms: Record<string, string[]>; // Order of rooms per categoryId
  };
  themePreset: string;
  customCss: string;
  pendingShare: any | null;
  hapticFeedbackEnabled: boolean;
  hapticsDebugEnabled: boolean;
  runAtStartup: boolean;
  startMinimized: boolean;
  sidebarOpen: boolean;
  contextMenu: {
    type: 'room' | 'message' | 'music-item' | 'global' | null;
    data: any;
  };
  _contextMenuHandled: boolean;
  confirmationDialog: {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
  };
  mediaPreview: {
    url: string;
    type: 'image' | 'video';
    alt?: string;
  } | null;

  // Modals state
  verificationModalOpen: boolean;
  aboutModalOpen: boolean;
  globalSearchModalOpen: boolean;
  createRoomModalOpen: boolean;
  createSpaceModalOpen: boolean;
  roomSettingsModalOpen: boolean;
  spaceSettingsModalOpen: boolean;
  activeSettingsRoomId: string | null;
  activeSettingsSpaceId: string | null;
}

export const useUIStore = defineStore('ui', {
  state: (): UIState => ({
    memberListVisible: false,
    selectedUserId: null,
    profileCardPos: { top: '0px', right: '0px' },
    collapsedCategories: [],
    showEmptyRooms: false,
    composerStates: {},
    uiOrder: { rootSpaces: [], categories: {}, rooms: {} },
    themePreset: 'default',
    customCss: '',
    pendingShare: null,
    hapticFeedbackEnabled: true,
    hapticsDebugEnabled: false,
    runAtStartup: false,
    startMinimized: false,
    sidebarOpen: false,
    contextMenu: {
      type: null,
      data: null,
    },
    _contextMenuHandled: false,
    confirmationDialog: {
      isOpen: false,
      title: '',
      description: '',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      onConfirm: () => { },
    },
    mediaPreview: null,

    // Modals
    verificationModalOpen: false,
    aboutModalOpen: false,
    globalSearchModalOpen: false,
    createRoomModalOpen: false,
    createSpaceModalOpen: false,
    roomSettingsModalOpen: false,
    spaceSettingsModalOpen: false,
    activeSettingsRoomId: null,
    activeSettingsSpaceId: null,
  }),

  actions: {
    async initialize() {
      this.themePreset = await getPref('matrix_theme_preset', 'default');
      this.customCss = await getPref('matrix_custom_css', '');
      this.hapticFeedbackEnabled = await getPref('matrix_haptic_feedback_enabled', true);
      this.hapticsDebugEnabled = await getPref('matrix_haptics_debug_enabled', false);
      this.showEmptyRooms = await getPref('matrix_show_empty_rooms', false);
      this.collapsedCategories = await getPref('matrix_collapsed_categories', []);
      this.runAtStartup = await getPref('app_run_at_startup', false);
      this.startMinimized = await getPref('app_start_minimized', false);
      this.uiOrder = await getPref('matrix_ui_order', { rootSpaces: [], categories: {}, rooms: {} });
    },

    async toggleMemberList() {
      this.memberListVisible = !this.memberListVisible;
      if (this.memberListVisible) {
        this.sidebarOpen = false;
      }
      if (this.hapticFeedbackEnabled) {
        const { WebHaptics } = await import('web-haptics');
        const haptics = new WebHaptics({ debug: this.hapticsDebugEnabled });
        haptics.trigger('light');
      }
      await setPref('matrix_member_list_visible', this.memberListVisible);
    },

    setUISelectedUser(userId: string | null, pos?: { top: string; right: string; left?: string }) {
      this.selectedUserId = userId;
      if (pos) {
        this.profileCardPos = pos;
      }
    },

    setUIComposerState(roomId: string, state: Partial<UIState['composerStates'][string]>) {
      if (!this.composerStates[roomId]) {
        this.composerStates[roomId] = {};
      }
      this.composerStates[roomId] = {
        ...this.composerStates[roomId],
        ...state
      };
    },

    handleReply(msg: any) {
      if (!msg.roomId) return;
      this.setUIComposerState(msg.roomId, {
        replyingTo: msg,
        editingMessage: undefined
      });
    },

    async toggleUICategory(categoryId: string) {
      const index = this.collapsedCategories.indexOf(categoryId);
      if (index === -1) {
        this.collapsedCategories.push(categoryId);
      } else {
        this.collapsedCategories.splice(index, 1);
      }
      await setPref('matrix_collapsed_categories', this.collapsedCategories);
    },

    async toggleShowEmptyRooms() {
      this.showEmptyRooms = !this.showEmptyRooms;
      await setPref('matrix_show_empty_rooms', this.showEmptyRooms);
    },

    async toggleSidebar(open?: boolean) {
      if (typeof open === 'boolean') {
        this.sidebarOpen = open;
      } else {
        this.sidebarOpen = !this.sidebarOpen;
      }
      if (this.sidebarOpen) {
        this.memberListVisible = false;
      }
      if (this.hapticFeedbackEnabled) {
        const { WebHaptics } = await import('web-haptics');
        const haptics = new WebHaptics({ debug: this.hapticsDebugEnabled });
        haptics.trigger('light');
      }
    },

    async setThemePreset(id: string) {
      this.themePreset = id;
      await setPref('matrix_theme_preset', id);
    },

    async setCustomCss(css: string) {
      this.customCss = css;
      await setPref('matrix_custom_css', css);
    },

    async setHapticFeedbackEnabled(enabled: boolean) {
      this.hapticFeedbackEnabled = enabled;
      await setPref('matrix_haptic_feedback_enabled', enabled);
    },

    async setHapticsDebugEnabled(enabled: boolean) {
      this.hapticsDebugEnabled = enabled;
      await setPref('matrix_haptics_debug_enabled', enabled);
    },

    async setRunAtStartup(enabled: boolean) {
      this.runAtStartup = enabled;
      await setPref('app_run_at_startup', enabled);
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        const { enable, disable } = await import('@tauri-apps/plugin-autostart');
        if (enabled) await enable();
        else await disable();
      }
    },

    async setStartMinimized(enabled: boolean) {
      this.startMinimized = enabled;
      await setPref('app_start_minimized', enabled);
    },

    setContextMenu(type: UIState['contextMenu']['type'], data: any = null) {
      this.contextMenu.type = type;
      this.contextMenu.data = data;
    },

    openRoomContextMenu(roomId: string) {
      this.setContextMenu('room', { roomId });
      this._contextMenuHandled = true;
    },

    openMessageContextMenu(msg: any) {
      this.setContextMenu('message', { msg });
      this._contextMenuHandled = true;
    },

    openMusicItemContextMenu(item: any) {
      this.setContextMenu('music-item', { item });
      this._contextMenuHandled = true;
    },

    openConfirmationDialog(opts: {
      title: string;
      description: string;
      confirmLabel?: string;
      cancelLabel?: string;
      onConfirm: () => void;
    }) {
      this.confirmationDialog = {
        isOpen: true,
        title: opts.title,
        description: opts.description,
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        onConfirm: opts.onConfirm,
      };
    },

    closeConfirmationDialog() {
      this.confirmationDialog.isOpen = false;
    },

    openGlobalSearchModal() {
      this.globalSearchModalOpen = true;
    },

    closeGlobalSearchModal() {
      this.globalSearchModalOpen = false;
    },

    openCreateRoomModal() {
      this.createRoomModalOpen = true;
      this.globalSearchModalOpen = false;
    },

    closeCreateRoomModal() {
      this.createRoomModalOpen = false;
    },

    openCreateSpaceModal() {
      this.createSpaceModalOpen = true;
      this.globalSearchModalOpen = false;
    },

    closeCreateSpaceModal() {
      this.createSpaceModalOpen = false;
    },

    openRoomSettingsModal(roomId: string) {
      this.activeSettingsRoomId = roomId;
      this.roomSettingsModalOpen = true;
    },

    closeRoomSettingsModal() {
      this.roomSettingsModalOpen = false;
      this.activeSettingsRoomId = null;
    },

    openSpaceSettingsModal(spaceId: string) {
      this.activeSettingsSpaceId = spaceId;
      this.spaceSettingsModalOpen = true;
    },

    closeSpaceSettingsModal() {
      this.spaceSettingsModalOpen = false;
      this.activeSettingsSpaceId = null;
    },

    openAboutModal() {
      this.aboutModalOpen = true;
    },

    closeAboutModal() {
      this.aboutModalOpen = false;
    },

    openMediaPreview(media: { url: string, type: 'image' | 'video', alt?: string }) {
      this.mediaPreview = media;
    },

    closeMediaPreview() {
      this.mediaPreview = null;
    },

    setVerificationModalOpen(open: boolean) {
        this.verificationModalOpen = open;
    }
  }
});
