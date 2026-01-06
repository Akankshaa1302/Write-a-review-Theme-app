function AuctionThemeAppExtension() {
  const { createApp, ref, onBeforeMount, computed, onMounted, watch, onUnmounted } = Vue;
   const AuctionCodeApp = createApp({
    setup() {
      // State variables
      const isConfirmBuyNowLoading = ref(false);
      const confirmBuyNowBid = ref(false);
      const isYourBid = ref(false);
      const allBidsDetails = ref();
      const currentProxyBidValue = ref();
      const auctionSettingsData = ref(null);
      const auctionTimerData = ref(null);
      const isDialogVisible = ref(false);
      const toast = ref(null);
      

      const pusher = ref();
      const isProxyDialogVisible = ref(false);
      const targetAmount = ref(null);
      const bidAmount = ref(0);
      const targetDate = ref();
      
      // API URL
      const apiBaseURL = 'https://api.beta.shipturtle.app/api/v2';
      
      // DOM elements
      let makeAnOfferButton;
      const productPrice = document.querySelector('.product-block--price');
      const productForm = document.querySelector('form[method="post"][action="/cart/add"]');
      
      // Error handling
      const titleCaseError = ref();
      
      // Product info
      const variantID = ref(window.selectedVariantId);
      
      // Timers
      let countdownTimeInterval;
      
      // Countdown structure
      const countdown = ref([
        { value: 0, label: 'Days' },
        { value: 0, label: 'Hours' },
        { value: 0, label: 'Minutes' },
        { value: 0, label: 'Seconds' }
      ]);
      
      // Computed properties
      const isBuyoutPriceGreaterThanProxyBid = computed(() => {
        return Number(auctionTimerData.value.buyout_price) > Number(auctionTimerData.value.proxy_bid_value);
      })

      const formattedStartDate = computed(() => {
        if (!auctionTimerData.value || !auctionTimerData.value.start_date) return "N/A";
        return new Date(auctionTimerData.value.start_date).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
      });
      
      const formattedEndDate = computed(() => {
        if (!auctionTimerData.value || !auctionTimerData.value.end_date) return "N/A";
        return new Date(auctionTimerData.value.end_date).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
      });
      
      // Auction API functions

      async function buyItNow(){
        checkIfUserIsLoggedIn();
        try{
          isConfirmBuyNowLoading.value = true;
          const payload = {
            bidder_id: customerData.id,
            customer_name: customerData.first_name,
            customer_email: customerData.email,
          }
          const response = await axios.post(`${apiBaseURL}/auctions/${auctionTimerData.value.auction_id}/buy-now`,payload)
          window.open(response.data.invoice_url, '_blank');
          location.reload(true)
        }catch(err){
          showErrorToast(err.response.data.message);
        }
        finally{
          isConfirmBuyNowLoading.value = false;
        }
      }
      async function fetchAuctionSettings() {
        try {
          const res = await axios.get(`${apiBaseURL}/auction-settings`, {
            params: {
              shopify_domain: Shopify.shop
            }
          });
          auctionSettingsData.value = res.data;
        } catch (err) {
          console.error("Failed to fetch auction settings:", err);
        }
      }
      function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.getElementById(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const element = document.getElementById(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}
      async function fetchAuctionShopchannel() {
        titleCaseError.value = null;
        try {
          const { data } = await axios.get(`${apiBaseURL}/auctions/shop-channel`, {
            params: {
              bidderEmail: customerData.email || null,
              shopify_domain: Shopify.shop,
              channel_id: variantID.value,
            }
          });
          
          auctionTimerData.value = data.data;
          isYourBid.value = data.data.is_your_bid;
          if(auctionTimerData.value.status === 'active' && makeAnOfferButton) {
            makeAnOfferButton.style.display = 'block';
          }
          // Show/hide product form based on auction status
          // if (auctionTimerData.value.status !== 'active') {
          //   showProductForm();
          // } else {
          //   hideProductForm();
          // }
          
          return data.data;
        } catch (error) {
          handleAuctionFetchError(error);
          throw error;
        }
      }
      
      if(productData.productType == 'penny_credits') {
        showProductForm();
      }else{
        hideProductForm();
      }
      // Form visibility helpers
      function showProductForm() {
        console.log('Showing product form');
        if (productForm) productForm.style.visibility = 'visible';
        if (productPrice) productPrice.style.visibility = 'visible';
        console.log("yaha", productForm.style.visibility);
      }
      
      function hideProductForm() {
        if (productForm) productForm.style.visibility = 'hidden';
        if (productPrice) productPrice.style.visibility = 'hidden';
      }
      
      function handleAuctionFetchError(error) {
        // showProductForm();
        auctionTimerData.value = null;
        
        if (productData.productType !== 'penny_credits') {
          titleCaseError.value = error.response?.data?.message?.replace(/\b\w/g, 
            (char) => char.toUpperCase());
        }
      }
      function checkIfUserIsLoggedIn() {
         if (!customerData.id) {
          window.location.href = `https://${Shopify.shop}/account`;
          return;
        }
      }
      // Bidding functions
      async function placeBid() {
        // Check if user is logged in
        checkIfUserIsLoggedIn();
        
        // Check if user has penny auction credits
        if (auctionTimerData.value.is_penny_auction && auctionTimerData.value.credits === 0) {
          const pennyProduct = auctionTimerData.value.penny_products[0].url;
          window.open(`https://${Shopify.shop}/${pennyProduct}`, '_blank');
          return;
        }
        
        try {
          const payload = {
            auction_id: auctionTimerData.value.auction_id,
            bidder_id: customerData.id,
            customer_name: customerData.first_name,
            customer_email: customerData.email,
            bid_amount: bidAmount.value,
            max_bid_amount: bidAmount.value,
            is_proxy_bid: false
          };
          
          const response = await axios.post(
            `${apiBaseURL}/auctions/${auctionTimerData.value.auction_id}/bids`, 
            payload
          );
          
          showSuccessToast(response.data.message);
        } catch (err) {
          showErrorToast(err.response.data.message);
        }
      }
      
      async function placeProxyBid() {
        if (targetAmount.value === null) {
          showErrorToast('Please enter a valid amount');
          return;
        }
        
        try {
          const payload = {
            auction_id: auctionTimerData.value.auction_id,
            bidder_id: customerData.id,
            customer_name: customerData.first_name,
            customer_email: customerData.email,
            max_bid_amount: targetAmount.value,
            is_proxy_bid: true
          };
          
          const { data } = await axios.post(
            `${apiBaseURL}/auctions/${auctionTimerData.value.auction_id}/proxy-bids`, 
            payload
          );
          
          showSuccessToast(data.message);
          closeProxyBidModal();
        } catch (err) {
          showErrorToast(err.response.data.message);
          console.error(err.response.data.message);
        }
      }
      
      // Toast helpers
      function showSuccessToast(message) {
        toast.value.add({ 
          severity: 'success', 
          summary: 'Success', 
          detail: message, 
          life: 3000 
        });
      }
      
      function showErrorToast(message) {
        toast.value.add({ 
          severity: 'error', 
          summary: 'Error', 
          detail: message, 
          life: 3000 
        });
      }
      
      // Dialog functions
      async function viewAllBids() {
        try {
          const { data } = await axios.get(
            `${apiBaseURL}/auctions/${auctionTimerData.value.auction_id}/bidders`, 
            {
              params: {
                customer_email: customerData.email || null,
              }
            }
          );
          
          allBidsDetails.value = data;
          isDialogVisible.value = true;
        } catch (err) {
          console.error(err);
        }
      }
      async function showTheCurrentProxyBid() {
        try{
          const {data} = await axios.get(
             `${apiBaseURL}/auctions/${auctionTimerData.value.auction_id}/proxy-bid`,
             {
              params: {
                customer_email: customerData.email || null,
              }
            }
          );
          currentProxyBidValue.value = data.data;
        }catch (err) {
          console.error(err);
        }
      }
      function closeProxyBidModal() {
        isProxyDialogVisible.value = false;
        targetAmount.value = null;
      }
      function openConfirmBuyNowBid() {
        confirmBuyNowBid.value = true;
      }
      function closeConfirmBuyNowBid() {
        confirmBuyNowBid.value = false;
      }
      function openProxyBidModal() {
        showTheCurrentProxyBid();
        isProxyDialogVisible.value = true;
      }
      
      // Event handlers and timers
      const getVariantID = async() => {
        hideProductForm();
        clearInterval(countdownTimeInterval);
        variantID.value = ShopifyAnalytics?.meta?.selectedVariantId;
        
        try {
          await fetchAuctionShopchannel();
          setupBidEventListener();
        } catch (err) {
          console.error(err);
        }
      };
      
      function setupBidEventListener() {
        var channel = pusher.value.subscribe(`auction.${auctionTimerData.value.auction_id}`);
        channel.bind('bid.placed', function(data) {
          isYourBid.value = data.bidder_id === customerData.id;
          auctionTimerData.value.no_of_bids = data.total_bids;
          auctionTimerData.value.current_bid = data.current_price;
          auctionTimerData.value.next_min_bid = data.next_min_bid;
          auctionTimerData.value.end_date = data.end_date;
          auctionTimerData.value.proxy_bid_value = data.proxy_bid_value;
        });
      }
      
      function updateCountdown() {
        const now = new Date().getTime();
        const targetTime = targetDate.value.getTime();
        const timeLeft = targetTime - now;

        if (timeLeft > 0) {
          countdown.value = [
            { value: Math.floor(timeLeft / (1000 * 60 * 60 * 24)), label: 'Days' },
            { value: Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)), label: 'Hours' },
            { value: Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60)), label: 'Minutes' },
            { value: Math.floor((timeLeft % (1000 * 60)) / 1000), label: 'Seconds' }
          ];
        } else {
          countdown.value = [
            { value: 0, label: 'Days' },
            { value: 0, label: 'Hours' },
            { value: 0, label: 'Minutes' },
            { value: 0, label: 'Seconds' }
          ];
          clearInterval(countdownTimeInterval);
        }
      }
      
      // Lifecycle hooks
      async function fetchAuctionAPIData(){
 try{
          await fetchAuctionSettings();
          await fetchAuctionShopchannel();
          setupBidEventListener();
          document.getElementById('auction-loading-spinner').style.display = 'none';
          makeAnOfferButton = await waitForElement('make-an-offer');
        }catch(err){
          document.getElementById('auction-loading-spinner').style.display = 'none';
        }finally{
        }
      }
      onBeforeMount(() => {
        fetchAuctionAPIData();
        
        // Initialize Pusher
        pusher.value = new Pusher('ca6000ff157ec2104033', {
          cluster: 'ap2'
        });
        // Add event listener for variant changes
        if (productForm) {
          productForm.addEventListener('change', getVariantID);
        }
      });
      
      onMounted(() => {
        const vueApp = document.getElementById('app');
        if (vueApp) vueApp.style.display = 'block';
        toast.value = PrimeVue.useToast();
      });
      
      onUnmounted(() => {
        if (productForm) {
          productForm.removeEventListener('change', getVariantID);
        }
        clearInterval(countdownTimeInterval);
      });
      
      // Watchers
      watch(auctionTimerData, (newValue) => {
        if(newValue && newValue.status === 'scheduled') {
          targetDate.value = new Date(newValue.start_date);
           updateCountdown();
            countdownTimeInterval = setInterval(updateCountdown, 1000); 
        }
        else{
          if (newValue && newValue.end_date) {
            targetDate.value = new Date(auctionTimerData.value.end_date);
            updateCountdown();
            countdownTimeInterval = setInterval(updateCountdown, 1000); 
          }
        }
      });
      
      // Return values for template use
      return {
        // State
        isConfirmBuyNowLoading,
        confirmBuyNowBid,
        isYourBid,
        allBidsDetails,
        auctionTimerData,
        auctionSettingsData,
        countdown,
        isDialogVisible,
        isProxyDialogVisible,
        targetAmount,
        bidAmount,
        titleCaseError,
        currentProxyBidValue,
        toast,
        
        // Computed properties
        isBuyoutPriceGreaterThanProxyBid,
        formattedStartDate,
        formattedEndDate,
        
        // Methods
        openConfirmBuyNowBid,
        closeConfirmBuyNowBid,
        buyItNow,
        placeBid,
        placeProxyBid,
        viewAllBids,
        openProxyBidModal,
        closeProxyBidModal
      };
    }
  });
  
  // Configure app
  AuctionCodeApp.config.compilerOptions.delimiters = ['[[', ']]'];
  AuctionCodeApp.use(PrimeVue.Config, {
    theme: {
      preset: PrimeVue.Themes.Aura,
      options: {
        darkModeSelector: false,
      }
    }
  });
  
  // Register PrimeVue components
  AuctionCodeApp.use(PrimeVue.ToastService);
  AuctionCodeApp.component('p-datatable', PrimeVue.DataTable);
  AuctionCodeApp.component('p-column', PrimeVue.Column);
  AuctionCodeApp.component('p-dialog', PrimeVue.Dialog);
  AuctionCodeApp.component('p-divider', PrimeVue.Divider);
  AuctionCodeApp.component('p-toast', PrimeVue.Toast);
  AuctionCodeApp.component('p-input-number', PrimeVue.InputNumber);
  AuctionCodeApp.component('p-button', PrimeVue.Button);
  
  // Mount app
  AuctionCodeApp.mount('#app');
}

(function() {
  'use strict';
    const fetchHTML = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const stPreview = urlParams.get('st_preview') || null;
      const { data } = await axios.get(`https://api.beta.shipturtle.app/auction?shop_domain=${Shopify.shop}&st_preview=${stPreview}`)
      document.getElementById('app').innerHTML = data.html
      document.getElementById('auction-styling').innerHTML = data.css
    }

  function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;            // preserve execution order
    s.onload  = () => resolve(src);
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// 2) List all your dependency URLs in order
const deps = [
  'https://unpkg.com/vue@3/dist/vue.global.prod.js',
  'https://js.pusher.com/8.2.0/pusher.min.js',
  'https://unpkg.com/axios/dist/axios.min.js',
  'https://unpkg.com/primevue/umd/primevue.min.js',
  'https://unpkg.com/@primevue/themes/umd/aura.min.js'
];

// 3) Load them all, then bootstrap
Promise.all(deps.map(loadScript))
  .then(async() => {
    await fetchHTML()
    AuctionThemeAppExtension();
  })
  .catch(err => {
    console.error('Dependency load error:', err);
  });
  // function checkDependencies() {
  //   const dependencies = {
  //     'Vue': typeof Vue !== 'undefined',
  //     'Pusher': typeof Pusher !== 'undefined', 
  //     'axios': typeof axios !== 'undefined',
  //     'PrimeVue': typeof PrimeVue !== 'undefined',
      
  //     // Add other dependencies you need
  //   };
    
  //   const missing = Object.keys(dependencies).filter(dep => !dependencies[dep]);
    
  //   if (missing.length === 0) {
  //     console.log('All dependencies loaded successfully');
  //     AuctionThemeAppExtension()
  //   } else {
  //     console.log('Waiting for dependencies:', missing);
  //     setTimeout(checkDependencies, 50);
  //   }
  // }
  
  // // Start checking dependencies
  // checkDependencies();
})();