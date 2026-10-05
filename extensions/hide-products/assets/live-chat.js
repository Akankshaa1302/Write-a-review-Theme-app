async function LiveChatThemeAppExtension() {
  const { createApp, ref, computed, onMounted, onBeforeMount , onBeforeUnmount, watch, nextTick  } = Vue;
  const { useToast } = PrimeVue;
  const { createI18n } = VueI18n;

  const getShopifyLocale = () => {
    const shopifyLocale = document.documentElement.lang ||
      document.querySelector('html')?.getAttribute('lang') ||
      window.Shopify?.locale ||
      navigator.language.split('-')[0]
    const supportedLocales = ['en', 'de', 'es', 'nl', 'pt', 'no', 'ro']
    const normalizedLocale = shopifyLocale.toLowerCase().split('-')[0]
    return supportedLocales.includes(normalizedLocale) ? normalizedLocale : 'en'
  }

  const loadLocaleMessages = async () => {
    const locale = getShopifyLocale()
    try {
      const appElement = document.getElementById('st-live-chat-app')
      const langJSONUrl = appElement?.getAttribute('data-lang-asset')
      if (!langJSONUrl) return { messages: { en: {} }, locale: 'en' }
      const allMessages = await fetch(langJSONUrl).then(r => r.json())
      if (!allMessages.en) allMessages.en = {}
      return { messages: allMessages, locale }
    } catch (error) {
      console.error('Failed to load locale messages:', error)
      return { messages: { en: {} }, locale: 'en' }
    }
  }

  const getBlockSettings = () => {
    try {
      const el = document.getElementById('st-live-chat-app')
      const raw = el?.getAttribute('data-block-settings')
      if (!raw) return { app_proxy_prefix: '/a/dashboard' }
      return JSON.parse(raw)
    } catch (error) {
      console.error('Failed to load live-chat block settings:', error)
      return { app_proxy_prefix: '/a/dashboard' }
    }
  }

  /** Must match Shopify app proxy "Subpath prefix" (leading slash, no trailing slash). */
  const normalizeAppProxyPrefix = (raw) => {
    const fallback = '/a/dashboard'
    if (typeof raw !== 'string' || !raw.trim()) return fallback
    const base = raw.trim().replace(/\/+$/, '')
    if (!base) return fallback
    return base.startsWith('/') ? base : `/${base}`
  }

  /** Attachment types the API accepts. */
  const ACCEPTED_FILES = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv'

  const NOTIFY_DEVELOPER_URL = 'https://api-v2.shipturtle.com/api/v1/notify-developer'

  const notifyDeveloperLiveChatProxy404 = (url, method) => {
    const shopDomain = window.Shopify?.shop
    const timestamp = new Date().toISOString()
    const networkType = navigator.connection?.effectiveType
    const lines = [
      '🚨 *Live Chat — App proxy 404*',
      `*Shop:* ${shopDomain}`,
      `*URL:* ${typeof url === 'string' ? url : ''}`,
      method ? `*Method:* ${method}` : '',
      '*HTTP:* 404',
      `*Time:* ${timestamp}`,
      networkType ? `*Network:* ${networkType}` : ''
    ].filter(Boolean)
    fetch(NOTIFY_DEVELOPER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: lines.join('\n'),
        via: 'slack',
        channel: 'shopify-theme-app-dependency-alerts'
      })
    }).catch(() => {})
  }

  const fetchViaAppProxy = async (url, init) => {
    const method = init?.method || 'GET'
    const res = await fetch(url, init)
    if (res.status === 404) {
      notifyDeveloperLiveChatProxy404(url, method)
    }
    return res
  }

  const { messages, locale } = await loadLocaleMessages()
  const i18n = createI18n({
    legacy: false,
    locale: locale,
    fallbackLocale: 'en',
    messages
  })

  const app = createApp({
    template: `
      <div class="st-live-chat-wrapper" :style="{ '--st-chat-primary': accentColor }">
        <!-- Inline Chat Trigger Button (merchant places this near Add to Cart / Buy Now) -->
        <button
          type="button"
          class="st-chat-trigger-button"
          @click="openChat"
          :style="triggerButtonStyle"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
          </svg>
          <span class="st-chat-trigger-text">{{ buttonLabel }}</span>
        </button>
        <p-toast></p-toast>
        <!-- Chat Drawer -->
        <p-drawer
          v-model:visible="isDialogVisible"
          position="right"
          :showCloseIcon="false"
          class="st-chat-drawer"
          :style="{ width: 'min(420px, 100vw)' }"
        >
          <template #header>
            <div class="st-chat-header">
              <div class="st-chat-header-text">
                <h3>{{ vendorName }}</h3>
              </div>
              <button type="button" class="st-chat-close-button" @click="closeChat" :aria-label="t('live-chat.closeChat')">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </template>

          <!-- Product Context -->
          <div v-if="productInfo.title" class="st-chat-product-bar">
            <img v-if="productInfo.image" :src="productInfo.image" class="st-chat-product-image" :alt="productInfo.title" />
            <div class="st-chat-product-info">
              <div class="st-chat-product-title">{{ productInfo.title }}</div>
              <div v-if="productInfo.price" class="st-chat-product-price">{{ productInfo.price }}</div>
            </div>
          </div>

          <div v-if="productInfo.title" class="st-chat-scope-note">
            {{ t('live-chat.scopeNote', { product: productInfo.title }) }}
          </div>

          <!-- Messages Area -->
          <div class="st-chat-messages-container" ref="messagesContainer">
            <template
              v-for="(message, index) in messages"
              :key="message.id"
            >
              <div
                v-if="shouldShowDate(index)"
                class="st-date-header"
              >
                {{ formatDateHeader(message.created_at) }}
              </div>
              <div :class="['st-message-wrapper', message.sender_type === 'customer' ? 'st-message-user' : 'st-message-support']">
                <div class="st-message-bubble">
                  <div class="st-message-header">
                    <span class="st-message-chip">{{ message.sender_type === 'customer' ? t('live-chat.customerLabel') : t('live-chat.sellerLabel') }}</span>
                    <span v-if="message.message" class="st-message-text">{{ message.message }}</span>
                  </div>

                  <div v-if="message.attachments?.length" class="st-chat-atts">
                    <template v-for="att in message.attachments" :key="att.id">
                      <a
                        v-if="att.kind === 'image'"
                        class="st-chat-att-image"
                        :href="att.url"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img :src="att.url" :alt="att.file_name" loading="lazy" />
                      </a>

                      <a
                        v-else
                        class="st-chat-att-file"
                        :href="att.url"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                          <path d="M14 2v6h6" />
                        </svg>
                        <span class="st-chat-att-name">{{ att.file_name }}</span>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
                        </svg>
                      </a>
                    </template>
                  </div>
                  <div class="st-message-time">{{ formatTime(message.created_at)}}</div>
                  <span
                    v-if="
                      isLastMessage(index) &&
                      message.sender_type === 'customer' &&
                      getSeenByString(message)
                    "
                    class="st-seen-by"
                  >
                    {{ t('live-chat.seenBySeller') }}
                  </span>
                </div>
              </div>
            </template>

            <!-- Typing Indicator -->
            <div v-if="typingUsers.length" class="st-typing-indicator">
            <div class="st-typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>

            <span class="st-typing-text">
              {{ t('live-chat.sellerTyping') }}
            </span>
          </div>
          </div>

          <!-- Input Area -->
          <template #footer>
            <div class="st-chat-footer">
              <div v-if="quickReplies.length" class="st-chat-quick-replies">
                <button
                  v-for="reply in quickReplies"
                  :key="reply"
                  type="button"
                  class="st-quick-reply-chip"
                  @click="sendQuickReply(reply)"
                >
                  {{ reply }}
                </button>
              </div>
              <div v-if="attachments.length" class="st-chat-attachments">
                <div
                  v-for="item in attachments"
                  :key="item.uid"
                  class="st-chat-chip"
                  :class="'is-' + item.status"
                >
                  <span v-if="item.status === 'uploading'" class="st-chat-chip-spinner" aria-hidden="true"></span>
                  <span class="st-chat-chip-name">{{ item.name }}</span>
                  <button
                    type="button"
                    class="st-chat-chip-remove"
                    :aria-label="t('live-chat.removeAttachment')"
                    :title="t('live-chat.removeAttachment')"
                    @click="removeAttachment(item.uid)"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div class="st-chat-input-row">
                <p-file-upload
                  ref="fileUpload"
                  mode="basic"
                  name="file"
                  class="st-chat-attach"
                  :accept="acceptedFiles"
                  choose-icon="pi pi-paperclip"
                  :choose-label="''"
                  :auto="true"
                  :custom-upload="true"
                  :multiple="true"
                  :disabled="!chatExists || attachments.some((a) => a.status === 'uploading')"
                  @uploader="uploadAttachment"
                ></p-file-upload>
                <p-input-text
                  v-model="newMessage"
                  :placeholder="t('live-chat.messagePlaceholder', { vendor: vendorName })"
                  @keyup.enter="sendMessage"
                  class="st-chat-input"
                  :disabled="isSending"
                />
                <p-button
                  icon="pi pi-send"
                  @click="sendMessage"
                  :disabled="!canSend"
                  class="st-send-button"
                  :loading="isSending"
                  severity="primary"
                />
              </div>
            </div>
          </template>
        </p-drawer>
      </div>
    `,
    setup() {
      const { t } = VueI18n.useI18n();
      const isDialogVisible = ref(false);
      const messages = ref([]);
      const newMessage = ref('');
      const isSending = ref(false);
      const isTyping = ref(false);
      const messagesContainer = ref(null);
      const blockSettings = getBlockSettings();
      const baseApiUrl = normalizeAppProxyPrefix(blockSettings.app_proxy_prefix);
      const accentColor = ref(window.stLiveChatConfig?.accentColor || blockSettings.accent_color || '#4F46E5');
      const buttonLabel = computed(() => {
        const labelTemplate = blockSettings.button_text || 'Chat with {vendor}';
        return labelTemplate.replace('{vendor}', window.productVendor || t('live-chat.vendorFallback'));
      });
      const triggerButtonStyle = computed(() => ({
        background: blockSettings.button_bg_color || '#EEF2FF',
        color: blockSettings.button_text_color || '#4F46E5',
        borderColor: blockSettings.button_border_color || '#C7D2FE',
        width: blockSettings.custom_width || '100%',
        height: blockSettings.custom_height || 'auto'
      }));
      const vendorName = computed(() => window.productVendor || t('live-chat.vendorFallback'));
      const productInfo = computed(() => ({
        title: window.productTitle || '',
        image: window.productImage || '',
        price: window.productPrice || ''
      }));
      const quickReplies = computed(() => {
        const raw = blockSettings.quick_replies || '';
        return raw.split(',').map(s => s.trim()).filter(Boolean);
      });
      const sendQuickReply = (text) => {
        newMessage.value = text;
        sendMessage();
      };
      const shopifyDomain = ref(Shopify.shop);
      const productId = ref(ShopifyAnalytics.meta.product.id);
      const chatExists = ref(false);
      const chatId = ref(null);
      const typingUsers = ref([]);  
      const pusher = ref();
      const toast = useToast();
      const customerDetails = ref({
        id: window.customerId,
        name: window.customerName,
        email: window.customerEmail,        
      })
      let chatChannel = null;   
      function setupEventListener() {
        try {
          chatChannel = pusher.value.subscribe(`private-support-chat.${chatId.value}`);
          
          chatChannel.bind('message.sent', function(data) {
            const exists = messages.value.find(msg => msg.id === data.id);
            if (!exists) {
              messages.value.push(data);
              
              if (isDialogVisible.value) {
                nextTick(() => {
                  scrollToBottom();
                });
              }
            }
            if (chatId.value && isDialogVisible.value) {
              markChatAsRead(chatId.value);
            }
          });

          chatChannel.bind('message.read', function(data) {
            messages.value.forEach(msg => {
              const alreadyRead = msg.read_by.some(
                r => r.participant_id === data.reader_id && r.participant_type === data.reader_type
              );
              if (!alreadyRead) {
                msg.read_by.push({
                  participant_id: data.reader_id,
                  participant_type: data.reader_type,
                  read_at: data.read_at,
                });
              }
            });
          });
          chatChannel.bind('user.typing', function(data) {
            // Only show typing indicator for seller (merchant/vendor), not for the customer themselves
            if (data.sender_type === 'customer') return;
            if (!typingUsers.value.includes('Seller')) {
              typingUsers.value.push('Seller');
              setTimeout(() => {
                typingUsers.value = typingUsers.value.filter(u => u !== 'Seller');
              }, 2000);
            }
          });

        } catch (error) {
          console.error('Error initializing Pusher:', error);
        }
      }

      const openChat = () => {
        if(customerDetails.value.id) {
            isDialogVisible.value = true;
            nextTick(() => {
              scrollToBottom();
            });
        } else {
            toast.add({
                severity: 'warn',
                summary: t('live-chat.loginRequiredTitle'),
                detail: t('live-chat.loginRequiredDetail'),
                life: 3000
            });
            setTimeout(() => {
                window.location.href = `/customer_authentication/login?return_to=${encodeURIComponent(window.location.pathname)}`
            }, 1500);
        }
        if(chatId.value){
          markChatAsRead(chatId.value);
        }
      };

      const closeChat = () => {
        isDialogVisible.value = false;
      };
      /* ------------------------------------------------- attachments -- */

      const fileUpload = ref(null)
      const acceptedFiles = ACCEPTED_FILES
      /** Queued uploads: { uid, name, status: 'uploading'|'success'|'failed', id? } */
      const attachments = ref([])
      let attachmentSeq = 0

      const uploadedIds = computed(() =>
        attachments.value.filter(a => a.status === 'success').map(a => a.id)
      )

      const canSend = computed(() =>
        !isSending.value &&
        !attachments.value.some(a => a.status === 'uploading') &&
        Boolean(newMessage.value.trim() || uploadedIds.value.length)
      )

      const isAcceptedFile = (fileName) => {
        const name = fileName.toLowerCase()
        return ACCEPTED_FILES.split(',').some(ext => name.endsWith(ext))
      }

      /** Patches a row through the reactive array so the chip re-renders. */
      const patchAttachment = (uid, changes) => {
        const row = attachments.value.find(a => a.uid === uid)
        if (row) Object.assign(row, changes)
      }

      /** One request per file — the endpoint takes a single file at a time. */
      const uploadOne = async (file, uid) => {
        try{
          const formData = new FormData()
          formData.append('file', file, file.name)

          const response = await fetchViaAppProxy(`${baseApiUrl}/customer/chats/${chatId.value}/attachments?shop=${shopifyDomain.value}&logged_in_customer_id=${customerDetails.value.id}`, {
            method: 'POST',
            body: formData
          })

          const data = await response.json()
          const id = data?.id ?? data?.data?.id
          if (!id) throw new Error('Attachment response carried no id')
          patchAttachment(uid, { status: 'success', id })
        }
        catch(error){
          console.error('Error uploading attachment:', error)
          patchAttachment(uid, { status: 'failed' })
          toast.add({
            severity: 'error',
            summary: t('live-chat.attachFailed'),
            detail: file.name,
            life: 3000
          })
        }
      }

      /**
       * Picked files upload straight away, one call each, and queue up as chips.
       * Their ids ride along with the next message as `attachments: [id, …]`.
       */
      const uploadAttachment = (event) => {
        const files = Array.isArray(event.files) ? event.files : [event.files]
        // Reset FileUpload's own state so the same file can be picked again.
        fileUpload.value?.clear?.()
        if (!chatId.value) return

        files.filter(Boolean).forEach(file => {
          // `accept` only filters the picker; the OS dialog can still be
          // switched to "All files", so the extension is checked here too.
          if (!isAcceptedFile(file.name)) {
            toast.add({
              severity: 'warn',
              summary: t('live-chat.attachType'),
              detail: file.name,
              life: 4000
            })

            return
          }

          // Names repeat, so rows are keyed on their own counter.
          const uid = ++attachmentSeq
          attachments.value.push({ uid, name: file.name, status: 'uploading' })
          uploadOne(file, uid)
        })
      }

      const removeAttachment = (uid) => {
        attachments.value = attachments.value.filter(a => a.uid !== uid)
      }

      const sendMessage = () => {
        if(chatExists.value == false){
          sendMessageToNewChat();
        }else{
          sendMessageToExistingChat();
        }
      }
      // Attachments need a chat id, so this branch stays text-only; the
      // paperclip is disabled until the chat exists.
      const sendMessageToNewChat = async () => {
        if (!newMessage.value.trim() || isSending.value) return;

        const messageText = newMessage.value.trim();
        isSending.value = true;

        try{
          const response = await fetchViaAppProxy(`${baseApiUrl}/customer/chats/initiate?shop=${shopifyDomain.value}&logged_in_customer_id=${customerDetails.value.id}`, {
          method: 'POST',
          body: JSON.stringify({
            initial_message: messageText,
            subject: `${customerDetails.value.name ? customerDetails.value.name : 'Customer'}<>${window.productVendor}`,
            product_channel_id: productId.value
          })
          });
          await fetchchatMessages();
          newMessage.value = '';

          // Subscribe to Pusher channel for the newly created chat
          if (chatId.value) {
            setupEventListener();
          }

          // Scroll to bottom
          setTimeout(() => {
            scrollToBottom();
          }, 100);
        }
        catch(error){
          console.error('Error sending message:', error);
        }
        finally{
          isSending.value = false;
        }
      }
      const sendMessageToExistingChat = async () => {
        if (!canSend.value) return;

        const messageText = newMessage.value.trim();
        isSending.value = true;
        try{
          const body = {};
          if (messageText) body.message = messageText;
          if (uploadedIds.value.length) body.attachments = uploadedIds.value;

          const response = await fetchViaAppProxy(`${baseApiUrl}/customer/chats/${chatId.value}/messages`, {
            method: 'POST',
            body: JSON.stringify(body)
          });

          const data = await response.json();

          newMessage.value = '';
          attachments.value = [];

          // Refetch rather than wait for the broadcast: the pushed payload does
          // not carry attachments, so the sent message would render without
          // them. Same reason sendMessageToNewChat refetches.
          await fetchchatMessages();

          // Scroll to bottom
          setTimeout(() => {
            scrollToBottom();
          }, 100);
        }
        catch(error){
          console.error('Error sending message:', error);
        }
        finally{
          isSending.value = false;
        }
      }
      const markChatAsRead = async (chatId) => {
        try{
          const response = await fetchViaAppProxy(`${baseApiUrl}/customer/chats/${chatId}/read?shop=${shopifyDomain.value}&logged_in_customer_id=${customerDetails.value.id}`,{
            method: 'POST'
          });
        }
        catch(error){
          console.error('Error marking chat as read:', error);
        }
      }
      const isLastMessage = (index) => {
        return index === messages.value.length - 1;
      };
      const getSeenByString = (message) => {
      if (!message.read_by || message.read_by.length === 0) return false;
      // Return true if any seller (non-customer) has read the message
      return message.read_by.some(
        r => r.participant_type !== 'customer' && r.participant_id !== null && r.participant_id !== undefined
      );
    };

     const formatTime = (timestamp) => {
        const date = new Date(timestamp);

        return date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
      };

      const shouldShowDate = (index) => {
      if (index === 0) return true;

      const currentMessage = messages.value[index];
      const previousMessage = messages.value[index - 1];

      const currentDate = new Date(currentMessage.created_at).toDateString();
      const previousDate = new Date(previousMessage.created_at).toDateString();

      return currentDate !== previousDate;
    };

        const formatDateHeader = (timestamp) => {
        const date = new Date(timestamp);

        return date.toLocaleDateString('en-US', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      };


      



      const scrollToBottom = () => {
        const container = messagesContainer.value;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      };

      const fetchchatMessages = async () => {
      try {
        const response = await fetchViaAppProxy(
          `${baseApiUrl}/customer/chats/by-product?shop=${shopifyDomain.value}&logged_in_customer_id=${customerDetails.value.id}&product_channel_id=${productId.value}`
        );

        const data = await response.json();
        if (data?.data?.messages && data.data?.messages.length > 0) {
          messages.value = data?.data?.messages.reverse();
          chatId.value = data?.data?.id;
          chatExists.value = true;
        } else {
          messages.value = [];
          chatExists.value = false;
        }

      } catch (error) {
        console.error('Error fetching chat messages:', error);
        messages.value = [];
        chatExists.value = false;
      }
};
     const sendTypingStatus = async (chatId) => {
      try{
        const response = await fetchViaAppProxy(`${baseApiUrl}/customer/chats/${chatId}/typing?shop=${shopifyDomain.value}&logged_in_customer_id=${customerDetails.value.id}`,{
          method: 'POST'
        });
      }
      catch(error){
        console.error('Error sending typing status:', error);
      }
     }
     const lastTypingSentAt = ref(0)
     const TYPING_COOLDOWN = 3000

      watch(newMessage, newText => {
        if (newText.trim().length > 0 && chatId.value) {
          const now = Date.now()
          if (now - lastTypingSentAt.value > TYPING_COOLDOWN) {
            sendTypingStatus(chatId.value)
            lastTypingSentAt.value = now
          }
        }
      })

      onBeforeMount(async () => {
        // Initialize Pusher
        pusher.value = new Pusher('d7db7850adabc9323922', {
          cluster: 'ap2',
          authEndpoint : `${baseApiUrl}/customer/chats/broadcasting/auth?shop=${shopifyDomain.value}&logged_in_customer_id=${customerDetails.value.id}`
        });
      })
      onMounted(async () => {

        await fetchchatMessages();

        if (chatId.value) {
          setupEventListener();
        }
      });

      onBeforeUnmount(() => {
        if (chatChannel) {
          chatChannel.unbind_all();
          chatChannel.unsubscribe();
        }

      });

      return {
        t,
        isDialogVisible,
        messages,
        newMessage,
        isSending,
        isTyping,
        typingUsers,
        accentColor,
        buttonLabel,
        triggerButtonStyle,
        vendorName,
        productInfo,
        quickReplies,
        sendQuickReply,
        messagesContainer,
        fileUpload,
        acceptedFiles,
        attachments,
        canSend,
        chatExists,
        uploadAttachment,
        removeAttachment,
        openChat,
        closeChat,
        sendMessage,
        formatTime,
        formatDateHeader,
        shouldShowDate,
        isLastMessage,
        getSeenByString
      };
    }
  });

  // Configure PrimeVue
  app.use(PrimeVue.Config, {
    theme: {
      preset: PrimeVue.Themes.Aura
    }
  });
  app.use(PrimeVue.ToastService);
  app.use(i18n);
  // Register PrimeVue components
  app.component('p-drawer', PrimeVue.Drawer);
  app.component('p-button', PrimeVue.Button);
  app.component('p-toast', PrimeVue.Toast);
  app.component('p-input-text', PrimeVue.InputText);
  app.component('p-file-upload', PrimeVue.FileUpload);

  app.config.compilerOptions.delimiters = ["{{", "}}"];

  app.mount('#st-live-chat-app');

}

(function() {
  'use strict';

  const extraDeps = [
    { src: window.ST_Resources?._assetBase ? window.ST_Resources._assetBase + 'pusher.min.js' : 'https://js.pusher.com/8.2.0/pusher.min.js', global: 'Pusher' },
  ];

  if (window.ST_Resources) {
    ST_Resources.loadDependencies(async () => {
      LiveChatThemeAppExtension();
    }, extraDeps, 'Live Chat');
  } else {
    const interval = setInterval(() => {
      if (window.ST_Resources) {
        clearInterval(interval);
        ST_Resources.loadDependencies(async () => {
          LiveChatThemeAppExtension();
        }, extraDeps, 'Live Chat');
      }
    }, 50);
  }
})();
