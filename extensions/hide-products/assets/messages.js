async function MessagesThemeAppExtension() {
  const { createApp, ref, computed, watch, nextTick, onMounted, onBeforeMount, onBeforeUnmount } = Vue;
  const { createI18n } = VueI18n;
  const { useToast } = PrimeVue;

  const ROOT_ID = 'st-messages-app';

  const baseApiUrl = '/a/dashboard';

  /** Chats requested per page. */
  const PER_PAGE = 20;

  /** Attachment types the API accepts. */
  const ACCEPTED_FILES = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv';

  /* ------------------------------------------------------------- config -- */

  const getShopifyLocale = () => {
    const shopifyLocale =
      document.documentElement.lang ||
      document.querySelector('html')?.getAttribute('lang') ||
      window.Shopify?.locale ||
      navigator.language.split('-')[0];
    const supportedLocales = ['en', 'de', 'es', 'nl', 'pt', 'no', 'ro'];
    const normalizedLocale = shopifyLocale.toLowerCase().split('-')[0];
    return supportedLocales.includes(normalizedLocale) ? normalizedLocale : 'en';
  };

  const loadLocaleMessages = async () => {
    const locale = getShopifyLocale();
    try {
      const appElement = document.getElementById(ROOT_ID);
      const langJSONUrl = appElement?.getAttribute('data-lang-asset');
      if (!langJSONUrl) return { messages: { en: {} }, locale: 'en' };
      const allMessages = await fetch(langJSONUrl).then((r) => r.json());
      if (!allMessages.en) allMessages.en = {};
      return { messages: allMessages, locale };
    } catch (error) {
      console.error('Failed to load locale messages:', error);
      return { messages: { en: {} }, locale: 'en' };
    }
  };

  const getBlockSettings = () => {
    try {
      const el = document.getElementById(ROOT_ID);
      const raw = el?.getAttribute('data-block-settings');
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (error) {
      console.error('Failed to read messages block settings:', error);
      return {};
    }
  };

  const blockSettings = getBlockSettings();
  const customer = window.stMessagesCustomer || {};
  const shopDomain = window.Shopify?.shop || '';

  /* ----------------------------------------------------------- fetching -- */

  const notifyProxyFailure = (url, method, status) => {
    if (!window.ST_Resources?.notifyDeveloper) return;
    ST_Resources.notifyDeveloper({
      feature: 'Messages',
      title: 'Messages — App proxy request failed',
      fields: { URL: url, Method: method, HTTP: status }
    });
  };

  /** Every app-proxy call carries these, as in live-chat.js. */
  const authParams = `shop=${shopDomain}&logged_in_customer_id=${customer.id || ''}`;

  const fetchViaAppProxy = async (path, init) => {
    const method = init?.method || 'GET';
    const url = `${baseApiUrl}${path}`;
    // FormData sets its own multipart boundary, so it must carry no Content-Type.
    const isUpload = init?.body instanceof FormData;
    const res = await fetch(url, {
      headers: isUpload ? undefined : { 'Content-Type': 'text/plain' },
      ...init
    });
    if (res.status === 404 || res.status >= 500) {
      notifyProxyFailure(url, method, res.status);
    }
    if (!res.ok) throw new Error(`Request failed (${res.status}) — ${url}`);
    // POSTs may answer with an empty body; that is a success, not a failure.
    return res.json().catch(() => null);
  };

  /* ------------------------------------------------------ payload shape -- */

  /** One chat row -> one sidebar entry. */
  const toConversation = (raw) => ({
    id: raw.id,
    vendorId: raw.vendor?.id ?? raw.vendor_id ?? null,
    // A vendor-level chat has no linked product.
    isVendorLevel: !raw.queryable,
    productImage: raw.queryable?.image || '',
    productTitle: raw.queryable?.title || raw.vendor?.brand_name || '',
    vendorName: raw.queryable?.vendor || raw.subject || '',
    lastMessage: raw.latest_message?.message || '',
    lastMessageAt: raw.last_message_at || '',
    unreadCount: Number(raw.unread_count) || 0
  });

  /**
   * The seller profile links here as /pages/messages?vendor=<id>&vendor_name=<name>
   * to open that vendor's thread, creating it on first send if it is new.
   */
  const linkedVendor = (() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('vendor');
    return id ? { id, name: params.get('vendor_name') || '' } : null;
  })();

  /* ------------------------------------------------------------- i18n -- */

  const { messages: localeMessages, locale } = await loadLocaleMessages();
  const i18n = createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages: localeMessages
  });

  /** Day-first date locale so headers read "18 May 2026". */
  const dateLocale = locale === 'en' ? 'en-GB' : locale;

  /* --------------------------------------------------------------- app -- */

  const app = createApp({
    template: `
      <div class="st-messages-root" :class="{ 'is-thread-open': isThreadOpen }" :style="rootStyle">
        <p-toast></p-toast>
        <div class="st-msg-shell">

          <!-- ============================ conversation list ============ -->
          <aside class="st-msg-list-pane">
            <div class="st-msg-list-header">
              <h2 class="st-msg-heading">
                <svg class="st-msg-heading-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                  <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                </svg>
                <span>{{ t('messages.inbox') }}</span>
                <span v-if="totalUnread > 0" class="st-msg-heading-badge">
                  {{ totalUnread > 99 ? '99+' : totalUnread }}
                </span>
              </h2>

              <div class="st-msg-search">
                <span class="st-msg-search-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </span>
                <input
                  v-model="searchTerm"
                  type="search"
                  class="st-msg-search-input"
                  :placeholder="searchPlaceholder"
                  :aria-label="searchPlaceholder"
                />
              </div>

            </div>

            <div
              class="st-msg-conversations"
              ref="conversationsEl"
              @scroll.passive="onConversationsScroll"
            >
              <div v-if="isLoadingConversations" aria-busy="true">
                <div v-for="n in 7" :key="n" class="st-msg-conv-skeleton">
                  <span class="st-msg-skeleton-thumb"></span>
                  <span class="st-msg-skeleton-lines">
                    <span class="st-msg-skeleton-line is-title"></span>
                    <span class="st-msg-skeleton-line is-sub"></span>
                    <span class="st-msg-skeleton-line is-preview"></span>
                  </span>
                </div>
              </div>

              <div v-else-if="!visibleConversations.length" class="st-msg-empty">
                <span class="st-msg-empty-title">{{ t('messages.emptyListTitle') }}</span>
                <span class="st-msg-empty-text">{{ t('messages.emptyListText') }}</span>
              </div>

              <button
                v-for="conversation in visibleConversations"
                :key="conversation.id"
                type="button"
                class="st-msg-conv"
                :class="{ 'is-active': conversation.id === activeConversationId }"
                @click="openConversation(conversation.id)"
              >
                <img
                  v-if="conversation.productImage"
                  class="st-msg-conv-thumb"
                  :src="conversation.productImage"
                  :alt="conversation.productTitle"
                  loading="lazy"
                  @error="conversation.productImage = ''"
                />
                <span v-else class="st-msg-conv-thumb st-msg-conv-thumb-fallback" aria-hidden="true">
                  {{ initialsFor(conversation) }}
                </span>

                <span class="st-msg-conv-body">
                  <span class="st-msg-conv-top">
                    <span class="st-msg-conv-title">{{ conversation.productTitle }}</span>
                    <span v-if="conversation.lastMessageAt" class="st-msg-conv-time">
                      {{ formatListTime(conversation.lastMessageAt) }}
                    </span>
                  </span>
                  <span class="st-msg-conv-sub">{{ conversation.vendorName }}</span>
                  <span class="st-msg-conv-bottom">
                    <span class="st-msg-conv-preview">{{ conversation.lastMessage }}</span>
                  </span>
                </span>

                <span v-if="conversation.unreadCount > 0" class="st-msg-conv-badge">
                  {{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}
                </span>
              </button>

              <div v-if="isLoadingMore" class="st-msg-loading-more">
                <span class="st-msg-spinner" aria-hidden="true"></span>
              </div>
            </div>
          </aside>

          <!-- ================================== thread ================= -->
          <section class="st-msg-thread-pane">
            <template v-if="activeConversation">
              <header class="st-msg-thread-header">
                <button type="button" class="st-msg-back" :aria-label="t('messages.backToList')" @click="closeConversation">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>

                <img
                  v-if="activeConversation.productImage"
                  class="st-msg-thread-thumb"
                  :src="activeConversation.productImage"
                  :alt="activeConversation.productTitle"
                  @error="activeConversation.productImage = ''"
                />
                <span v-else class="st-msg-thread-thumb st-msg-conv-thumb-fallback" aria-hidden="true">
                  {{ initialsFor(activeConversation) }}
                </span>

                <div class="st-msg-thread-meta">
                  <h3 class="st-msg-thread-title">{{ activeConversation.productTitle }}</h3>
                  <!-- "Sold by" only reads right on a product chat. -->
                  <div
                    v-if="!activeConversation.isVendorLevel && activeConversation.vendorName"
                    class="st-msg-thread-vendor"
                  >
                    {{ t('messages.soldBy') }} <strong>{{ activeConversation.vendorName }}</strong>
                  </div>
                </div>

                <div class="st-msg-thread-aside">
                  <div v-if="activeConversation.productPrice" class="st-msg-thread-price">
                    <div class="st-msg-thread-amount">{{ activeConversation.productPrice }}</div>
                    <div v-if="activeConversation.productQty" class="st-msg-thread-qty">
                      {{ t('messages.qty') }} {{ activeConversation.productQty }}
                    </div>
                  </div>
                </div>
              </header>

              <div class="st-msg-messages" ref="messagesContainer">
                <div v-if="isLoadingMessages" class="st-msg-thread-skeleton" aria-busy="true">
                  <span
                    v-for="n in 6"
                    :key="n"
                    class="st-msg-skeleton-bubble"
                    :class="n % 2 ? 'is-them' : 'is-own'"
                  ></span>
                </div>

                <template v-else>
                  <template v-for="(message, index) in threadMessages" :key="message.id">
                    <div v-if="showsDateSeparator(index)" class="st-msg-date-sep">
                      {{ formatDateHeader(message.created_at) }}
                    </div>

                    <div class="st-msg-row" :class="isOwn(message) ? 'is-own' : 'is-them'">
                      <span class="st-msg-sender">{{ senderLabel(message) }}</span>
                      <div class="st-msg-bubble">
                        <span v-if="message.message" class="st-msg-text">{{ message.message }}</span>

                        <div v-if="message.attachments?.length" class="st-msg-atts">
                          <template v-for="att in message.attachments" :key="att.id">
                            <a
                              v-if="att.kind === 'image'"
                              class="st-msg-att-image"
                              :href="att.url"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <img :src="att.url" :alt="att.file_name" loading="lazy" />
                            </a>

                            <a
                              v-else
                              class="st-msg-att-file"
                              :href="att.url"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                                <path d="M14 2v6h6" />
                              </svg>
                              <span class="st-msg-att-name">{{ att.file_name }}</span>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
                              </svg>
                            </a>
                          </template>
                        </div>
                      </div>
                      <span class="st-msg-time">
                        {{ formatTime(message.created_at) }}
                      </span>
                    </div>

                    <div v-if="showsReceipt(index)" class="st-msg-receipt">
                      {{ seenBySeller(message) ? t('messages.seen') : t('messages.delivered') }}
                    </div>
                  </template>

                  <div v-if="isSellerTyping" class="st-msg-typing">
                    <span class="st-msg-typing-dots"><span></span><span></span><span></span></span>
                    <span>{{ t('messages.sellerTyping') }}</span>
                  </div>
                </template>
              </div>

              <footer class="st-msg-composer">
                <div v-if="quickReplies.length" class="st-msg-quick-replies">
                  <button
                    v-for="reply in quickReplies"
                    :key="reply"
                    type="button"
                    class="st-msg-quick-chip"
                    @click="sendQuickReply(reply)"
                  >
                    {{ reply }}
                  </button>
                </div>

                <div v-if="attachments.length" class="st-msg-chips">
                  <div
                    v-for="item in attachments"
                    :key="item.uid"
                    class="st-msg-chip"
                    :class="'is-' + item.status"
                  >
                    <span v-if="item.status === 'uploading'" class="st-msg-chip-spinner" aria-hidden="true"></span>
                    <span class="st-msg-chip-name">{{ item.name }}</span>
                    <button
                      type="button"
                      class="st-msg-chip-remove"
                      :aria-label="t('messages.removeAttachment')"
                      :title="t('messages.removeAttachment')"
                      @click="removeAttachment(item.uid)"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div class="st-msg-input-row">
                  <div class="st-msg-input-wrap">
                    <p-file-upload
                      ref="fileUpload"
                      mode="basic"
                      name="file"
                      class="st-msg-attach"
                      :accept="acceptedFiles"
                      choose-icon="pi pi-paperclip"
                      :choose-label="''"
                      :auto="true"
                      :custom-upload="true"
                      :multiple="true"
                      :disabled="attachments.some((a) => a.status === 'uploading')"
                      :pt="{ root: { title: t('messages.attach'), 'aria-label': t('messages.attach') } }"
                      @uploader="uploadAttachment"
                    ></p-file-upload>
                    <input
                      v-model="draft"
                      type="text"
                      class="st-msg-input"
                      :placeholder="composerPlaceholder"
                      :aria-label="composerPlaceholder"
                      :disabled="isSending"
                      @keyup.enter="sendMessage"
                    />
                  </div>
                  <p-button
                    class="st-msg-send"
                    :label="t('messages.send')"
                    :loading="isSending"
                    :disabled="!canSend"
                    @click="sendMessage"
                  ></p-button>
                </div>
              </footer>
            </template>

            <div v-else class="st-msg-empty st-msg-empty-thread">
              <svg
                class="st-msg-empty-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
              </svg>
              <span class="st-msg-empty-text">{{ t('messages.noThreadTitle') }}</span>
            </div>
          </section>

        </div>
      </div>
    `,

    setup() {
      const { t } = VueI18n.useI18n();
      const toast = useToast();

      const conversations = ref([]);
      const threadMessages = ref([]);
      const activeConversationId = ref(null);
      /** Chat id of the open thread. */
      const chatId = ref(null);
      const searchTerm = ref('');
      const draft = ref('');
      const isLoadingConversations = ref(true);
      const totalUnread = ref(0);
      const isLoadingMore = ref(false);
      const conversationsEl = ref(null);
      const currentPage = ref(1);
      const lastPage = ref(1);
      const isLoadingMessages = ref(false);
      const isSending = ref(false);
      const isSellerTyping = ref(false);
      const isThreadOpen = ref(false);
      const messagesContainer = ref(null);
      const fileUpload = ref(null);
      const acceptedFiles = ACCEPTED_FILES;
      /** Queued uploads: { uid, name, status: 'uploading'|'success'|'failed', id? } */
      const attachments = ref([]);
      let attachmentSeq = 0;

      /* -------------------------------------------------- presentation -- */

      // Accent and the rest of the palette come from messages.css, overridable
      // through the block's Custom CSS setting.
      const rootStyle = computed(() => ({
        '--st-msg-height': blockSettings.panel_height || '640px'
      }));

      const searchPlaceholder = computed(() => t('messages.searchPlaceholder'));
      const composerPlaceholder = computed(
        () => blockSettings.composer_placeholder || t('messages.composerPlaceholder')
      );

      const quickReplies = computed(() => {
        const raw = blockSettings.quick_replies || '';
        return raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      });

      /**
       * A conversation-shaped stand-in for a vendor the customer has never
       * messaged. It is not in the list and has no chat id — the record is
       * created by /customer/chats/initiate on the first send.
       */
      const draftConversation = ref(null);

      const activeConversation = computed(
        () =>
          conversations.value.find((c) => c.id === activeConversationId.value) ||
          draftConversation.value
      );

      // The list already arrives filtered by the API.
      const visibleConversations = computed(() => conversations.value);

      const initialsFor = (conversation) => {
        const source = conversation.vendorName || conversation.productTitle || '?';
        return source
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word.charAt(0))
          .join('');
      };

      /* ---------------------------------------------------- formatting -- */

      const formatTime = (timestamp) =>
        new Date(timestamp).toLocaleTimeString(dateLocale, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

      /**
       * Conversation-list stamp, matching the dashboard's ChatList.vue:
       * today -> time only, this year -> day and month, older -> full date.
       */
      const formatListTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return '';

        const now = new Date();

        if (date.toDateString() === now.toDateString())
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (date.getFullYear() === now.getFullYear())
          return date.toLocaleDateString([], { month: 'short', day: 'numeric' });

        return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      };

      const formatDateHeader = (timestamp) =>
        new Date(timestamp).toLocaleDateString(dateLocale, {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });

      const isOwn = (message) => message.sender_type === 'customer';

      const senderLabel = (message) =>
        isOwn(message)
          ? t('messages.you')
          : activeConversation.value?.vendorName || t('messages.seller');

      const showsDateSeparator = (index) => {
        if (index === 0) return true;
        const current = new Date(threadMessages.value[index].created_at).toDateString();
        const previous = new Date(threadMessages.value[index - 1].created_at).toDateString();
        return current !== previous;
      };

      const seenBySeller = (message) =>
        (message.read_by || []).some(
          (r) => r.participant_type !== 'customer' && r.participant_id != null
        );

      /** Delivered/Seen receipt only under the last message of the thread, and only if it is ours. */
      const showsReceipt = (index) => {
        if (index !== threadMessages.value.length - 1) return false;
        const message = threadMessages.value[index];
        return isOwn(message);
      };

      /* --------------------------------------------------------- data -- */

      /**
       * Searching and paging are both done by the API. `append` adds the next
       * page to the list instead of replacing it, for the infinite scroll.
       */
      const fetchChats = async ({ page = 1, append = false } = {}) => {
        if (append) isLoadingMore.value = true;
        else isLoadingConversations.value = true;

        try {
          const params = new URLSearchParams({ per_page: PER_PAGE, page });
          const term = searchTerm.value.trim();
          if (term) params.set('search', term);

          const data = await fetchViaAppProxy(
            `/customer/chats?${params.toString()}&${authParams}`
          );

          const paginator = data?.data || {};
          const rows = (paginator.data || []).map(toConversation);

          conversations.value = append ? conversations.value.concat(rows) : rows;
          currentPage.value = paginator.current_page || page;
          lastPage.value = paginator.last_page || 1;
        } catch (error) {
          console.error('Error fetching chats:', error);
          // A failed page keeps whatever is already on screen.
          if (!append) conversations.value = [];
        } finally {
          isLoadingMore.value = false;
          isLoadingConversations.value = false;
        }
      };

      const loadMoreChats = () => {
        if (isLoadingMore.value || isLoadingConversations.value) return;
        if (currentPage.value >= lastPage.value) return;
        fetchChats({ page: currentPage.value + 1, append: true });
      };

      /** Fetches the next page as the list nears its end. */
      const onConversationsScroll = () => {
        const el = conversationsEl.value;
        if (!el) return;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 90) loadMoreChats();
      };

      /** The existing vendor-level chat with this vendor, if there is one. */
      const findVendorChat = (vendorId) =>
        conversations.value.find(
          (c) => c.isVendorLevel && String(c.vendorId) === String(vendorId)
        );

      /** Arrived from the seller profile: open that vendor's thread, or draft one. */
      const openLinkedVendor = async () => {
        if (!linkedVendor) return;

        const existing = findVendorChat(linkedVendor.id);
        if (existing) {
          await openConversation(existing.id);

          return;
        }

        draftConversation.value = {
          id: null,
          vendorId: linkedVendor.id,
          isVendorLevel: true,
          productImage: '',
          // No product, so the vendor name is the headline.
          productTitle: linkedVendor.name,
          vendorName: linkedVendor.name,
          lastMessage: ''
        };
        activeConversationId.value = null;
        chatId.value = null;
        threadMessages.value = [];
        isThreadOpen.value = true;
      };

      /** The chat list carries no messages, so the thread is fetched on open. */
      const fetchChatMessages = async (conversation, { showLoader = true } = {}) => {
        // The refetch after sending keeps the thread on screen until the new
        // list lands, rather than blanking the pane and popping it back.
        isLoadingMessages.value = showLoader;
        // The list row's id is the chat id; set it first so send/read/typing
        // still work even if the thread fetch fails.
        chatId.value = conversation.id;
        try {
          const data = await fetchViaAppProxy(`/customer/chats/${conversation.id}?${authParams}`);
          threadMessages.value = (data?.data?.messages || []).reverse();
        } catch (error) {
          console.error('Error fetching chat messages:', error);
          threadMessages.value = [];
        } finally {
          isLoadingMessages.value = false;
          await nextTick();
          scrollToBottom();
        }
      };

      /* Total unread across every chat, for the Inbox heading. */
      const fetchUnreadCount = async () => {
        try {
          const res = await fetchViaAppProxy(`/customer/chats/unread/count?${authParams}`);
          totalUnread.value = Number(res?.data?.unread_count) || 0;
        } catch (error) {
          console.error('Error fetching unread count:', error);
          totalUnread.value = 0;
        }
      };

      const markChatAsRead = async () => {
        if (!chatId.value) return;
        // Clear the badge straight away; the list is not refetched on open.
        if (activeConversation.value) activeConversation.value.unreadCount = 0;
        try {
          await fetchViaAppProxy(`/customer/chats/${chatId.value}/read?${authParams}`, {
            method: 'POST'
          });
          // This chat's unreads just went to zero, so the heading total is stale.
          await fetchUnreadCount();
        } catch (error) {
          console.error('Error marking chat as read:', error);
        }
      };

      const sendTypingStatus = async () => {
        try {
          await fetchViaAppProxy(`/customer/chats/${chatId.value}/typing?${authParams}`, {
            method: 'POST'
          });
        } catch (error) {
          console.error('Error sending typing status:', error);
        }
      };

      /* ----------------------------------------------------- selection -- */

      const openConversation = async (conversationId) => {
        isThreadOpen.value = true;
        if (activeConversationId.value === conversationId) return;

        // Picking a real chat discards any unsent draft thread.
        draftConversation.value = null;
        activeConversationId.value = conversationId;
        draft.value = '';
        attachments.value = [];
        isSellerTyping.value = false;

        await fetchChatMessages(activeConversation.value);
        subscribeToConversation();
        markChatAsRead();
      };

      const closeConversation = () => {
        isThreadOpen.value = false;
      };

      const scrollToBottom = () => {
        const container = messagesContainer.value;
        if (container) container.scrollTop = container.scrollHeight;
      };

      /* ------------------------------------------------------- sending -- */

      /** Ids of everything that finished uploading, in the order they were picked. */
      const uploadedIds = computed(() =>
        attachments.value.filter((a) => a.status === 'success').map((a) => a.id)
      );

      /** Text, uploaded attachments, or both — and never mid-upload. */
      const canSend = computed(
        () =>
          !isSending.value &&
          !attachments.value.some((a) => a.status === 'uploading') &&
          Boolean(draft.value.trim() || uploadedIds.value.length)
      );

      /**
       * First message to a vendor the customer has never written to — creates
       * the chat, as sendMessageToNewChat does in live-chat.js. No product is
       * involved, so no product_channel_id is sent.
       */
      const startChatWithVendor = async (text) => {
        const vendor = draftConversation.value;
        const customerName = customer.name || customer.firstName || 'Customer';

        await fetchViaAppProxy(`/customer/chats/initiate?${authParams}`, {
          method: 'POST',
          body: JSON.stringify({
            initial_message: text,
            subject: `${customerName}<>${vendor.vendorName}`,
            // TODO(confirm): the key the backend expects for a vendor-level chat.
            vendor_id: vendor.vendorId
          })
        });

        // The chat exists now: pick it up from the refreshed list and open it.
        draft.value = '';
        await fetchChats();

        const created = findVendorChat(vendor.vendorId);
        draftConversation.value = null;
        if (created) await openConversation(created.id);
      };

      const sendMessage = async () => {
        if (!canSend.value) return;

        const text = draft.value.trim();
        const conversation = activeConversation.value;
        isSending.value = true;
        try {
          if (!chatId.value) {
            await startChatWithVendor(text);

            return;
          }

          const body = {};
          if (text) body.message = text;
          if (uploadedIds.value.length) body.attachments = uploadedIds.value;

          await fetchViaAppProxy(`/customer/chats/${chatId.value}/messages?${authParams}`, {
            method: 'POST',
            body: JSON.stringify(body)
          });

          draft.value = '';
          attachments.value = [];
          await fetchChatMessages(conversation, { showLoader: false });
          if (text) conversation.lastMessage = text;
        } catch (error) {
          console.error('Error sending message:', error);
          toast.add({
            severity: 'error',
            summary: t('messages.sendFailed'),
            detail: error?.message,
            life: 3000
          });
        } finally {
          isSending.value = false;
        }
      };

      const sendQuickReply = (text) => {
        draft.value = text;
        sendMessage();
      };

      /* --------------------------------------------------- attachments -- */

      const isAcceptedFile = (fileName) => {
        const name = fileName.toLowerCase();
        return ACCEPTED_FILES.split(',').some((ext) => name.endsWith(ext));
      };

      /** Patches a row through the reactive array so the chip re-renders. */
      const patchAttachment = (uid, changes) => {
        const row = attachments.value.find((a) => a.uid === uid);
        if (row) Object.assign(row, changes);
      };

      /** One request per file — the endpoint takes a single file at a time. */
      const uploadOne = async (file, uid) => {
        try {
          const formData = new FormData();
          formData.append('file', file, file.name);

          const data = await fetchViaAppProxy(
            `/customer/chats/${chatId.value}/attachments?${authParams}`,
            { method: 'POST', body: formData }
          );

          const id = data?.id ?? data?.data?.id;
          if (!id) throw new Error('Attachment response carried no id');
          patchAttachment(uid, { status: 'success', id });
        } catch (error) {
          console.error('Error uploading attachment:', error);
          patchAttachment(uid, { status: 'failed' });
          toast.add({
            severity: 'error',
            summary: t('messages.attachFailed'),
            detail: file.name,
            life: 3000
          });
        }
      };

      /**
       * Picked files upload straight away, one call each, and queue up as chips.
       * Their ids ride along with the next message as `attachments: [id, …]`;
       * nothing is sent until Send.
       */
      const uploadAttachment = (event) => {
        const files = Array.isArray(event.files) ? event.files : [event.files];
        // Reset FileUpload's own state so the same file can be picked again.
        fileUpload.value?.clear?.();
        if (!chatId.value) return;

        files.filter(Boolean).forEach((file) => {
          // `accept` only filters the picker; the OS dialog can still be
          // switched to "All files", so the extension is checked here too.
          if (!isAcceptedFile(file.name)) {
            toast.add({
              severity: 'warn',
              summary: t('messages.attachType'),
              detail: file.name,
              life: 4000
            });
            return;
          }

          // Names repeat, so rows are keyed on their own counter.
          const uid = ++attachmentSeq;
          attachments.value.push({ uid, name: file.name, status: 'uploading' });
          uploadOne(file, uid);
        });
      };

      const removeAttachment = (uid) => {
        attachments.value = attachments.value.filter((a) => a.uid !== uid);
      };

      /* -------------------------------------------- typing indicator -- */

      const lastTypingSentAt = ref(0);
      const TYPING_COOLDOWN = 3000;

      watch(draft, (value) => {
        if (!value.trim() || !chatId.value) return;
        const now = Date.now();
        if (now - lastTypingSentAt.value <= TYPING_COOLDOWN) return;
        lastTypingSentAt.value = now;
        sendTypingStatus();
      });

      /* -------------------------------------------------------- search -- */

      // Debounced so typing does not fire a request per keystroke.
      let searchTimer = null;

      watch(searchTerm, () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => fetchChats(), 350);
      });

      /* -------------------------------------------------------- pusher -- */

      const pusher = ref(null);
      let chatChannel = null;
      let typingTimer = null;

      const unsubscribeFromConversation = () => {
        if (!chatChannel) return;
        chatChannel.unbind_all();
        chatChannel.unsubscribe();
        chatChannel = null;
      };

      const subscribeToConversation = () => {
        if (!pusher.value || !chatId.value) return;
        unsubscribeFromConversation();

        try {
          chatChannel = pusher.value.subscribe(`private-support-chat.${chatId.value}`);

          chatChannel.bind('message.sent', (data) => {
            if (threadMessages.value.some((m) => m.id === data.id)) return;
            threadMessages.value.push(data);

            if (activeConversation.value) activeConversation.value.lastMessage = data.message;
            nextTick(scrollToBottom);
            markChatAsRead();
          });

          chatChannel.bind('message.read', (data) => {
            threadMessages.value.forEach((message) => {
              const already = (message.read_by || []).some(
                (r) => r.participant_id === data.reader_id && r.participant_type === data.reader_type
              );
              if (!already) {
                message.read_by = [
                  ...(message.read_by || []),
                  {
                    participant_id: data.reader_id,
                    participant_type: data.reader_type,
                    read_at: data.read_at
                  }
                ];
              }
            });
          });

          chatChannel.bind('user.typing', (data) => {
            if (data.sender_type === 'customer') return;
            isSellerTyping.value = true;
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
              isSellerTyping.value = false;
            }, 2000);
          });
        } catch (error) {
          console.error('Messages: Pusher subscription failed', error);
        }
      };

      /* ----------------------------------------------------- lifecycle -- */

      onBeforeMount(() => {
        if (typeof window.Pusher !== 'function') return;
        try {
          pusher.value = new Pusher('d7db7850adabc9323922', {
            cluster: 'ap2',
            authEndpoint: `${baseApiUrl}/customer/chats/broadcasting/auth?${authParams}`
          });
        } catch (error) {
          console.error('Messages: Pusher init failed', error);
        }
      });

      onMounted(async () => {
        await fetchChats();
        await openLinkedVendor();
        fetchUnreadCount();
      });

      onBeforeUnmount(() => {
        clearTimeout(typingTimer);
        clearTimeout(searchTimer);
        unsubscribeFromConversation();
      });

      return {
        t,
        conversations,
        threadMessages,
        activeConversationId,
        activeConversation,
        visibleConversations,
        searchTerm,
        draft,
        quickReplies,
        isLoadingConversations,
        totalUnread,
        isLoadingMore,
        conversationsEl,
        onConversationsScroll,
        isLoadingMessages,
        isSending,
        isSellerTyping,
        isThreadOpen,
        messagesContainer,
        fileUpload,
        acceptedFiles,
        attachments,
        canSend,
        uploadAttachment,
        removeAttachment,
        rootStyle,
        searchPlaceholder,
        composerPlaceholder,
        initialsFor,
        formatTime,
        formatListTime,
        formatDateHeader,
        isOwn,
        senderLabel,
        showsDateSeparator,
        showsReceipt,
        seenBySeller,
        openConversation,
        closeConversation,
        sendMessage,
        sendQuickReply
      };
    }
  });

  app.use(PrimeVue.Config, { theme: { preset: PrimeVue.Themes.Aura } });
  app.use(PrimeVue.ToastService);
  app.use(i18n);
  app.component('p-toast', PrimeVue.Toast);
  app.component('p-file-upload', PrimeVue.FileUpload);
  app.component('p-button', PrimeVue.Button);
  app.config.compilerOptions.delimiters = ['{{', '}}'];
  app.mount(`#${ROOT_ID}`);
}

(function () {
  'use strict';

  const start = () => {
    if (!document.getElementById('st-messages-app')) return;

    const extraDeps = [
      {
        src: window.ST_Resources?._assetBase
          ? window.ST_Resources._assetBase + 'pusher.min.js'
          : 'https://js.pusher.com/8.2.0/pusher.min.js',
        global: 'Pusher'
      }
    ];

    ST_Resources.loadDependencies(
      () => {
        MessagesThemeAppExtension();
      },
      extraDeps,
      'Messages'
    );
  };

  if (window.ST_Resources) {
    start();
  } else {
    const interval = setInterval(() => {
      if (!window.ST_Resources) return;
      clearInterval(interval);
      start();
    }, 50);
  }
})();
