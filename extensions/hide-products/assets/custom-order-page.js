document.addEventListener("DOMContentLoaded", function () {
  
  const { createApp, ref, onMounted, nextTick, watch, computed } = Vue;
  
    const app = createApp({
          setup(){
            const perPageOrderRows = ref(10)
            const totalOptions = ref([10, 20, 30,50,100]);
            const currency = window.customOrderPageGlobals.currency
            const itemsPerPage = ref(10);
            const metaFieldKeyElement = document.getElementById('metaFieldKey')
            const metaFieldKey = ref(metaFieldKeyElement.value)
            
            // Orders
            const ordersItems = ref([]);
            const loading = ref(true);
            const orderLineItems = ref([])
            const totalOrdersCount = ref(0)
            const fetchingOrders = ref(false)
            const currentPageNumber = ref(1)
            const first = ref(0)

            // Dialog
            const visible = ref(false)
            const handleCancel = () => {
              visible.value = false
            }
            const openDialog = (order) => {
              if (order.variant_images.length > 1) {
                visible.value = true
                orderLineItems.value = order.variant_images
              } else {
                download(order.variant_images[0].variant.product.metaData)
              }
            }

            // Orders
            const downloadInProgress = ref(false)
            const download = async (metaData) => {
              try {
                downloadInProgress.value = true
                const metaFieldDownloadURLs = metaData[metaFieldKey.value].value
                const links = []
                metaFieldDownloadURLs.forEach((url, index) => {
                  const modifiedURL = url.replace('https://d2i9a0muccv7uq.cloudfront.net', 'https://static.shipturtle.com')
                  links.push(modifiedURL)                  
                })
                const zipFile = await fetch('https://api.shipturtle.com/api/v2/get-zip-files',
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(links)
                  }
                )
                const zipFileLink = await zipFile.text()
    
                const link = document.createElement ("a");
                link.href = zipFileLink;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } catch (error) {
                console.error("API Error:", error);
              } finally {
                downloadInProgress.value = false
              }
          }
            const updatePageChanged = (page)=>{
              let pageNumber = 1
              if (itemsPerPage.value === page.rows) {
                pageNumber = page.page+1
                first.value = 0
              } else {
                first.value = page.first
                itemsPerPage.value = page.rows
              }
              fetchOrders(pageNumber)
            }
            
            const getOrdersItemsInSingleFlatArray = (orders) => {
              const flattenedOrders = []
              orders.forEach(order => {
                order.variant_images.forEach(item => {
                  flattenedOrders.push({...item, order_number: order.order_number, processed_at: order.processed_at})
                })
              })
              return flattenedOrders
            }

            const fetchOrders = async (page = 1) => {
              fetchingOrders.value = true;
              // const payload = {
              //   customer_email: 'meet.shipturtle@gmail.com',
              //   shop_domain: 'booking-testing-check.myshopify.com',
              //   limit: itemsPerPage.value,
              //   page: page,
              //   ascending: 1,
              //   orderBy: 'processed_at_timestamp' // Add any default orderBy value if needed
              // };
            
              const response = await fetch(`/a/dashboard/orders?limit=${itemsPerPage.value}&page=${page}&customer_email=${window.customerData.email}&shop=${Shopify.shop}&shop_domain=${Shopify.shop}`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json'
                },
                // body: JSON.stringify(payload)
              });
            
              const data = await response.json();
              totalOrdersCount.value = data.count;
              ordersItems.value = getOrdersItemsInSingleFlatArray(data.data)
              // orders.value = data.data;
              // if (page == 1) {
              //   resetOrders();
              //   totalOrdersCount.value = data.count;
              //   orders.value = data.data;
              // } else {
              //   orders.value.push(...data.data);
              // }
            
              fetchingOrders.value = false;

            };
            const resetOrders = () => {
              ordersItems.value = []
              currentPageNumber.value = 1
            }
            
            // Infinite Scroll
          //   const fetchMoreOrdersOnscrollTrigger = () => {
          //     const observer = new IntersectionObserver((entries) => {
          //         entries.forEach((entry) => {
          //             if (entry.isIntersecting) {
          //                currentPageNumber.value += 1;
          //                 if (currentPageNumber.value <= totalOrdersPages.value) {
          //                   fetchOrders(currentPageNumber.value)
          //                 } else {
          //                   observer.unobserve(entry.target)
          //                 }
          //             }
          //         })
          //     });
          //     observer.observe(document.getElementById('intersectionObeserverTarget'));
          //   } 

            const totalOrdersPages = computed(() => {
              if (totalOrdersCount.value == 0) {
                return 0;
              }
              const totalPages = Math.ceil(totalOrdersCount.value / itemsPerPage.value);
              return totalPages;
            })

          //   watch(totalOrdersCount, (count) => {
          //     if (count > itemsPerPage.value) {
          //       nextTick(() => {
          //         fetchMoreOrdersOnscrollTrigger()
          //       })
          //     }
          //   })

            // Hooks
            onMounted(async () =>{
              try {
                await fetchOrders()

                const loadingSpinner = document.getElementById('custom-order-page-loading-spinner')
                loadingSpinner.style.display = "none"
                const app = document.getElementById('custom-order-page')
                app.style.display = "block"
              } catch(error){
              console.error("API Error:", error);
              }
            })

          return { 
            first,
            updatePageChanged,
            perPageOrderRows,
            totalOptions,
            totalOrdersCount,
            fetchingOrders,
            itemsPerPage,
            metaFieldKey,
            currency,
            ordersItems,
            openDialog,
            download,
            loading,
            visible, 
            handleCancel,
            orderLineItems,
            downloadInProgress
          };
        }

    });
  
    const Noir = PrimeVue.definePreset(PrimeVue.Themes.Aura, {
      semantic: {
        primary: {
          50: "{zinc.50}",
          100: "{zinc.100}",
          200: "{zinc.200}",
          300: "{zinc.300}",
          400: "{zinc.400}",
          500: "{zinc.500}",
          600: "{zinc.600}",
          700: "{zinc.700}",
          800: "{zinc.800}",
          900: "{zinc.900}",
          950: "{zinc.950}",
        },
        colorScheme: {
          light: {
            primary: {
              color: "{zinc.950}",
              inverseColor: "#ffffff",
              hoverColor: "{zinc.900}",
              activeColor: "{zinc.800}",
            },
            highlight: {
              background: "{zinc.950}",
              focusBackground: "{zinc.700}",
              color: "#ffffff",
              focusColor: "#ffffff",
            },
          },
          dark: {
            primary: {
              color: "{zinc.50}",
              inverseColor: "{zinc.950}",
              hoverColor: "{zinc.100}",
              activeColor: "{zinc.200}",
            },
            highlight: {
              background: "rgba(250, 250, 250, .16)",
              focusBackground: "rgba(250, 250, 250, .24)",
              color: "rgba(255,255,255,.87)",
              focusColor: "rgba(255,255,255,.87)",
            },
          },
        },
      },
    });
  
    app.use(PrimeVue.Config, {
      theme: {
        preset: Noir,
        options: {
          darkModeSelector: false,
        },
      },
    });
    app.component("p-paginator", PrimeVue.Paginator);
    app.component("p-card", PrimeVue.Card);
    app.component("p-button", PrimeVue.Button);
    app.component('p-carousel', PrimeVue.Carousel);
    app.component("p-dialog", PrimeVue.Dialog);
    app.component('p-progress-spinner', PrimeVue.ProgressSpinner);
    
    app.config.compilerOptions.delimiters = ["[[", "]]"];
    app.mount("#custom-order-page");
  });
  

