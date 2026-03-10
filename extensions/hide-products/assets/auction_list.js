// Immediately log to verify script loading

// Use DOMContentLoaded instead of window.onload for better reliability
document.addEventListener('DOMContentLoaded', function() {
  
  // Wrap Vue initialization in try-catch to catch any errors
  try {
    const {createApp, ref, watchEffect, onUnmounted} = Vue;
    
    // Check if Vue is properly loaded
    if (!Vue || !createApp) {
      console.error('Vue is not properly loaded!');
      return;
    }
    
    const app = createApp({
      setup() {
        
        const selectedTab = ref('running');
        const betaBaseURL = ref('https://api.beta.shipturtle.app/api/v2');
        const productionBaseURL = ref('https://api.shipturtle.com/api/v2');
        const auctionList = document.getElementById('auctionList');
        const loader = document.getElementById('auction-loading-spinner');
        const apiBaseURL = ref();
        const wonAuctions = ref([]);
        const runningAuctions = ref([]);
        const countdowns = ref({});
        const countdownIntervals = ref({});
        
        // Check if Shopify object exists before accessing it
        if (typeof Shopify !== 'undefined' && Shopify.shop) {
          if(Shopify.shop === 'booking-testing-check.myshopify.com'){
            apiBaseURL.value = betaBaseURL.value;
          } else {
            apiBaseURL.value = productionBaseURL.value;
          }
        } else {
          console.error('Shopify object not available');
          apiBaseURL.value = productionBaseURL.value; // Default to production
        }
        
        onUnmounted(() => {
          Object.keys(countdownIntervals.value).forEach((key) => {
            clearInterval(countdownIntervals.value[key]);
          });
        });
        
        function openCheckoutLink(index){
          if (wonAuctions.value && wonAuctions.value[index]) {
            window.open(wonAuctions.value[index].purchase_link);
          }
        }
        
        const openRunningAuction = (index) => {
          if (runningAuctions.value && runningAuctions.value[index] && Shopify.shop) {
            window.open(`https://${Shopify.shop}/products/${runningAuctions.value[index].product_handle}`);
          }
        }
        
        const endTime = (index) => {
          if (!runningAuctions.value || !runningAuctions.value[index]) return '';
          
          const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          };
          const endDateAndTime = new Date(runningAuctions.value[index].end_date);
          const formattedDate = new Intl.DateTimeFormat('en-US', options).format(endDateAndTime);
          return formattedDate;
        }
        
        const calculateRemainingTime = (expiresAt) => {
          if (!expiresAt) return "00:00:00";
          
          const now = new Date().getTime();
          const expiryTime = new Date(expiresAt + 'z').getTime();
          const difference = expiryTime - now;
        
          if (difference <= 0) return "00:00:00"; // Stop countdown if expired
        
          const hours = Math.floor(difference / (1000 * 60 * 60)).toString().padStart(2, "0");
          const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, "0");
          const seconds = Math.floor((difference % (1000 * 60)) / 1000).toString().padStart(2, "0");
        
          return `${hours} hr ${minutes} min ${seconds} sec`;
        };
        
        const startCountdown = () => {
          if (!wonAuctions.value || !wonAuctions.value.length) return;
          
          wonAuctions.value.forEach((item, index) => {
            if (!item || !item.purchase_window || !item.purchase_window.expires_at) return;
            
            countdowns.value[index] = calculateRemainingTime(item.purchase_window.expires_at);
            countdownIntervals.value[index] = setInterval(() => {
              const remainingTime = calculateRemainingTime(item.purchase_window.expires_at);
              countdowns.value[index] = remainingTime;
        
              if (remainingTime === "00:00:00") {
                clearInterval(countdownIntervals.value[index]);
              }
            }, 1000);
          });
        };
        
        async function fetchRunningAuctions(){
          runningAuctions.value = null;
          
          if (!window.customerData || !window.customerData.id) {
            console.error('Customer data not available');
            return;
          }
          
          try {
            const response = await axios.get(`${apiBaseURL.value}/auctions/user/bid-history`, {
              params: {
                filter: selectedTab.value,
                bidder_id: window.customerData.id
              }
            });
            
            if (auctionList && loader) {
              auctionList.style.display = 'block';
              loader.style.display = 'none';
            }
            
            runningAuctions.value = response.data;
          } catch(err) {
            console.error('Error fetching running auctions:', err);
          }
        }
        
        async function fetchWinningAuctions(){
          wonAuctions.value = null;
          
          if (!window.customerData || !window.customerData.id) {
            console.error('Customer data not available');
            return;
          }
          
          try {
            const response = await axios.get(`${apiBaseURL.value}/auctions/user/won-auctions`, {
              params: {
                bidder_id: window.customerData.id
              }
            });
            
            if (auctionList) {
              auctionList.style.display = 'block';
            }
            
            wonAuctions.value = response.data.won_auctions || [];
            
            if (wonAuctions.value.length) {
              startCountdown();
            }
          } catch(err) {
            console.error('Error fetching winning auctions:', err);
          }
        }
        
        watchEffect(() => {
          if (selectedTab.value === 'running') {
            fetchRunningAuctions();
          } else {
            fetchWinningAuctions();
          }
        });
  
        return {
          endTime,
          openRunningAuction,
          openCheckoutLink,
          countdowns,
          selectedTab,
          wonAuctions,
          runningAuctions
        };
      }
    });
    
    app.config.compilerOptions.delimiters = ['[[', ']]'];
    
    // Check if PrimeVue is properly loaded
    if (!PrimeVue) {
      console.error('PrimeVue is not properly loaded!');
      return;
    }
    
    app.use(PrimeVue.Config, {
      theme: {
        preset: PrimeVue.Themes.Aura,
        options: {
          darkModeSelector: false
        }
      }
    });
   
    app.component('p-tabs', PrimeVue.Tabs);
    app.component('p-tab-list', PrimeVue.TabList);
    app.component('p-tab', PrimeVue.Tab);
    app.component('p-tab-panels', PrimeVue.TabPanels);
    app.component('p-tab-panel', PrimeVue.TabPanel);
    app.component('p-datatable', PrimeVue.DataTable);
    app.component('p-column', PrimeVue.Column);
    
    const auctionList = document.getElementById('auctionList');
    if (auctionList) {
      app.mount('#auctionList');
    } else {
      console.error('#auctionList element not found in DOM');
    }
  } catch (error) {
    console.error('Error initializing Vue app:', error);
  }
});

// Add another console log outside any functions to verify script execution