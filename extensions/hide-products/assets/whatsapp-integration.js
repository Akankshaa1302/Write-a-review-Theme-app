document.addEventListener("DOMContentLoaded", function () {
  
    const { createApp, ref, onMounted } = Vue;
    
      const app = createApp({
            setup(){
              const whatsappUrl = ref(window.whatsappUrlFromLiquid);
              const openWhatsAppChat = () => {
                if (whatsappUrl.value && whatsappUrl.value.trim() !== '') {
                    window.open(whatsappUrl.value, '_blank');
                } else {
                    console.warn('WhatsApp URL not found in product metafields');
                    alert('WhatsApp chat is not available for this product');
                }
            };
            return {
                whatsappUrl,
                openWhatsAppChat
            };
            }
  
      });
    
      
      app.use(PrimeVue);
    
      
      app.component("p-button", PrimeVue.Button);
      
      app.config.compilerOptions.delimiters = ["$%", "%"];
      app.mount("#whatsapp-widget");
    });
    
    
    