function LiveChatThemeAppExtension() {
  const { createApp, ref, computed, onMounted, onBeforeMount , onBeforeUnmount, watch, nextTick  } = Vue;
  const { useToast } = PrimeVue;
  const app = createApp({
    template: `
      <div class="st-live-chat-wrapper">
        <!-- Floating Chat Button -->
        <div 
          v-if="!isDialogVisible" 
          class="st-chat-float-button"
          @click="openChat"
          :style="{ background: buttonBgColor }"
        >
          <i class="pi pi-comment" style="font-size: 1.6rem; color: white;"></i>
        </div>
        <p-toast></p-toast>
        <!-- Chat Dialog -->
        <p-dialog 
          v-model:visible="isDialogVisible"
          :modal="false"
          :dismissableMask="false"
          :closable="true"
          :draggable="false"
          class="st-chat-dialog"
          position="bottomright"
          :style="{ width: '400px', height: '600px' }"
        >
          <template #header>
            <div class="st-chat-header">
              <div class="st-chat-header-info">
                <i class="pi pi-user" style="font-size: 2rem; color: white;"></i>
                <div class="st-chat-header-text">
                  <h3>Chat With Seller</h3>
                </div>
              </div>
            </div>
          </template>

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
                    <span class="st-message-chip">{{ message.sender_type === 'customer' ? 'Customer' : 'Seller' }}</span>
                    <span class="st-message-text">{{ message.message }}</span>
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
                    Seen by seller
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
              Seller is typing...
            </span>
          </div>
          </div>

          <!-- Input Area -->
          <template #footer>
              <p-input-text 
                v-model="newMessage"
                placeholder="Type your message..."
                @keyup.enter="sendMessage"
                class="st-chat-input"
                :disabled="isSending"
              />
              <p-button 
                icon="pi pi-send"
                @click="sendMessage"
                :disabled="!newMessage.trim() || isSending"
                class="st-send-button"
                :loading="isSending"
                severity="primary"
              />
            </div>
          </template>
        </p-dialog>
      </div>
    `,
    setup() {
      const isDialogVisible = ref(false);
      const messages = ref([]);
      const newMessage = ref('');
      const isSending = ref(false);
      const isTyping = ref(false);
      const buttonBgColor = ref(window.stLiveChatConfig?.buttonColor || '#4F46E5');
      const messagesContainer = ref(null);
      const baseApiUrl = '/a/dashboard';
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
            console.log('New message received:', data);
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
            console.log('Message read:', data);
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
            console.log('User typing:', data);
            // Only show typing indicator for seller (merchant/vendor), not for the customer themselves
            if (data.sender_type === 'customer') return;
            if (!typingUsers.value.includes('Seller')) {
              typingUsers.value.push('Seller');
              setTimeout(() => {
                typingUsers.value = typingUsers.value.filter(u => u !== 'Seller');
              }, 3000);
            }
          });

          console.log('Pusher initialized successfully');
        } catch (error) {
          console.error('Error initializing Pusher:', error);
        }
      }

      const openChat = () => {
        if(customerDetails.value.id) {
            console.log("log 1", customerDetails.value.id)
            isDialogVisible.value = true;
            nextTick(() => {
              scrollToBottom();
            });
        } else {
            toast.add({ 
                severity: 'warn', 
                summary: 'Login Required', 
                detail: 'Please login to continue', 
                life: 3000 
            });
            setTimeout(() => {
                window.location.href = "/account/login"
            }, 1500);
        }
        if(chatId.value){
          markChatAsRead(chatId.value);
        }
      };

      const closeChat = () => {
        isDialogVisible.value = false;
      };
      const sendMessage = () => {
        if(chatExists.value == false){
          sendMessageToNewChat();
        }else{
          sendMessageToExistingChat();
        }
      }
      const sendMessageToNewChat = async () => {
        if (!newMessage.value.trim() || isSending.value) return;

        const messageText = newMessage.value.trim();
        isSending.value = true;

        try{
          const response = await fetch(`${baseApiUrl}/customer/chats/initiate?shop=${shopifyDomain.value}&logged_in_customer_id=${customerDetails.value.id}`, {
          method: 'POST',
          body: JSON.stringify({
            initial_message: messageText,
            subject: `${customerDetails.value.name ? customerDetails.value.name : 'Customer'}<>${window.productVendor}`,
            product_channel_id: productId.value
          })
          });
          fetchchatMessages();
          newMessage.value = '';

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
        if (!newMessage.value.trim() || isSending.value) return;

        const messageText = newMessage.value.trim();
        isSending.value = true;
        try{
          const response = await fetch(`${baseApiUrl}/customer/chats/${chatId.value}/messages`, {
            method: 'POST',
            body: JSON.stringify({
              message: messageText
            })
          });

          const data = await response.json();
          messages.value.push(data.data);
          newMessage.value = '';

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
          const response = await fetch(`${baseApiUrl}/customer/chats/${chatId}/read?shop=${shopifyDomain.value}&logged_in_customer_id=${customerDetails.value.id}`,{
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
        const response = await fetch(
          `${baseApiUrl}/customer/chats/by-product?shop=${shopifyDomain.value}&logged_in_customer_id=${customerDetails.value.id}&product_channel_id=${productId.value}`
        );

        const data = await response.json();
        console.log("respinse get in fetch api", data);
        if (data?.data?.messages && data.data?.messages.length > 0) {
          messages.value = data?.data?.messages.reverse();
          chatId.value = data?.data?.id;
          console.log("Messages fetched successfully", messages.value);
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
        const response = await fetch(`${baseApiUrl}/customer/chats/${chatId}/typing?shop=${shopifyDomain.value}&logged_in_customer_id=${customerDetails.value.id}`,{
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
        console.log("Live chat is before mounting");
        // Initialize Pusher
        pusher.value = new Pusher('ca6000ff157ec2104033', {
          cluster: 'ap2',
          authEndpoint : `${baseApiUrl}/customer/chats/broadcasting/auth?shop=${shopifyDomain.value}&logged_in_customer_id=${customerDetails.value.id}`
        });
      })
      onMounted(async () => {

        console.log("Live chat is mounted");
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
        isDialogVisible,
        messages,
        newMessage,
        isSending,
        isTyping,
        typingUsers,
        buttonBgColor,
        messagesContainer,
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
  // Register PrimeVue components
  app.component('p-dialog', PrimeVue.Dialog);
  app.component('p-button', PrimeVue.Button);
  app.component('p-toast', PrimeVue.Toast);
  app.component('p-input-text', PrimeVue.InputText);

  app.config.compilerOptions.delimiters = ["{{", "}}"];

  app.mount('#st-live-chat-app');

}

(function() {
  'use strict';

  const extraDeps = [
    { src: 'https://js.pusher.com/8.2.0/pusher.min.js', global: 'Pusher' },
  ];

  if (window.ST_Resources) {
    ST_Resources.loadDependencies(async () => {
      LiveChatThemeAppExtension();
    }, extraDeps);
  } else {
    const interval = setInterval(() => {
      if (window.ST_Resources) {
        clearInterval(interval);
        ST_Resources.loadDependencies(async () => {
          LiveChatThemeAppExtension();
        }, extraDeps);
      }
    }, 50);
  }
})();
