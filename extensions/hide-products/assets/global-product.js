function GlobalProductCode() {
  const { createApp, ref, onMounted, watch } = Vue;

      const container = document.getElementById("global-product-table");
      if (container) {
        if (window.isglobalproduct === false) {
          container.style.display = "none";
        } else {
          container.style.display = "block";
        }
      }
    console.log("Is Global product", window.isglobalproduct)


  const app = createApp({
    setup() {
      const errorMessage = ref("");
      const variantId = ref(window.variantID);
      const shopifyDomain = ref(Shopify.shop);
      const vendorsList = ref([]);
      const isLoading = ref(true);
      const isAddingproductToCart = ref(false);
      const isGlobalProduct = ref(window.isglobalproduct !== false);

      const fetchvendorlist = async () => {
        isLoading.value = true;
        try {
          const response = await fetch(`https://api.shipturtle.com/api/v2/vendor-opted-products`,{
            method: 'POST',
            headers: {
                  'Content-Type': 'application/json'
                },
            body: JSON.stringify({
                channel_id: String(variantId.value),
                shopify_domain: shopifyDomain.value
              })
          });
          
        const data = await response.json();
        vendorsList.value = data.data; 

        // Scenario 2: Global product but empty sellers array
        if(isGlobalProduct.value && Array.isArray(data.data) && data.data.length === 0 ){
          errorMessage.value = "No Sellers Are Available";
        } else {
          errorMessage.value = "";
        }
       } catch (error) {
          errorMessage.value = "Error while fetching vendors";
        } finally {
          isLoading.value = false;
        }
      };

      const addProductToCart = async (vendor_variant_channel_id)=> {
        isAddingproductToCart.value = true;
        
        try{
          const formData = new FormData();
          formData.append('quantity', 1);
          formData.append('id', vendor_variant_channel_id);
          const response = await fetch(`/cart/add.js`,{
            method: 'POST',
            body: formData
          });
          window.location.href = `/cart`;
        } catch (error) {
          console.error("Error while adding product to cart:", error);
        } finally {
          isAddingproductToCart.value = false;
        }
      }

      const setupVariantWatcher = () => {
        let lastVariantId = null;

        const updateVariant = (newId) => {
          console.log("Checking variant update:", newId, lastVariantId);
          if (newId && newId !== lastVariantId) {
            lastVariantId = newId;
            variantId.value = newId;
          }
        };

        // 1. Watch URL (?variant=xxx)
        const checkUrlVariant = () => {
          const id = new URLSearchParams(window.location.search).get("variant");
          if (id) updateVariant(id);
        };

        ["pushState", "replaceState"].forEach((method) => {
          const original = history[method];
          history[method] = function () {
            const result = original.apply(this, arguments);
            window.dispatchEvent(new Event("locationchange"));
            return result;
          };
        });

        window.addEventListener("popstate", () =>
          window.dispatchEvent(new Event("locationchange"))
        );
        window.addEventListener("locationchange", checkUrlVariant);

        checkUrlVariant(); // initial run

        // 2. Watch hidden input[name="id"]
        const input = document.querySelector(
          'form[action="/cart/add"] [name="id"]'
        );
        if (input) {
          const observer = new MutationObserver(() =>
            updateVariant(input.value)
          );
          observer.observe(input, { attributes: true, attributeFilter: ["value"] });
          updateVariant(input.value);
        }
      };

      watch(variantId, (newVal) => {
        if (newVal && isGlobalProduct.value) {
          console.log("Fetching vendors for variant:", newVal);
          fetchvendorlist();
        }
      });

      onMounted(() => {
          // Scenario 3: Not a global product → don't fetch, show nothing (container hidden above)
          if (!isGlobalProduct.value) {
            isLoading.value = false;
            return;
          }
          setupVariantWatcher();
      });

      return { vendorsList, isLoading, addProductToCart, isAddingproductToCart, errorMessage, isGlobalProduct };
    }
  });

  app.use(PrimeVue);

  app.component("p-button", PrimeVue.Button);
  app.component("p-datatable", PrimeVue.DataTable);
  app.component("p-column", PrimeVue.Column);

  app.config.compilerOptions.delimiters = ["$%", "%"];
  app.mount("#global-product-table");
}

(function() {
    'use strict';
    
    if (window.ST_Resources) {
        ST_Resources.loadDependencies(GlobalProductCode);
    } else {
        const interval = setInterval(() => {
            if (window.ST_Resources) {
                clearInterval(interval);
                ST_Resources.loadDependencies(GlobalProductCode);
            }
        }, 50);
    }
})();