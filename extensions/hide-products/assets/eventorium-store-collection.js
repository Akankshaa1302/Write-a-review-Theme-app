// Create an app block and paste this inside to make it work

// {% schema %}
//   {
//     "name": "Collection",
//     "target": "section",
//     "stylesheet": "eventorium.css",
//     "javascript": "eventorium-store-collection.js",
//     "templates": ["collection"],
//     "available_if": "{{ app.metafields.shipturtle.custom_collection_page_availability_status }}",
//     "settings": []
//   }
// {% endschema %}

// {% render "eventorium-store-collection" %}
document.addEventListener("DOMContentLoaded", function () {
        const App = {
            data() {

                return {
                    baseUrl: 'https://api.shipturtle.com/api/v2',
                    products: [],
                    isLoading: false,
                    loadingMore: false,
                    next_page_url: null,
                    // Search By
                    service: null,
                    startDate: null,
                    endDate: null,
                    date_range: null,
                    config: {
                        wrap: true,
                        dateFormat: 'd-m-Y',
                        mode: 'single',
                        enableTime: false,
                        minDate: 'today',
                        closeOnSelect: true,
                        locale: 'en',  
                    },
                    offerSuccess: false
                };
            },
            methods: {
                getCookieValue(name) {
                    // Get all cookies as a single string
                    const cookies = document.cookie;
                  
                    // Split cookies into individual "name=value" pairs
                    const cookieArray = cookies.split(';');
                  
                    // Loop through the array to find the desired cookie
                    for (let cookie of cookieArray) {
                      // Remove leading spaces and split into name and value
                      const [cookieName, cookieValue] = cookie.trim().split('=');
                  
                      // Check if the cookie name matches the desired name
                      if (cookieName === name) {
                        return decodeURIComponent(cookieValue); // Decode the value if necessary
                      }
                    }
                  
                    // Return null if the cookie was not found
                    return null;
                  },
                  async fetchProducts(queryParams=null) {
                    try {        
                        this.isLoading = true;
                        const response = await fetch(`${this.baseUrl}/products/fetch?query=${queryParams}&shop_domain=${Shopify.shop}`)
                        const { data } = await response.json()
                        this.next_page_url = data.next_page_url
                        this.products = data.data
                        
                        this.isLoading = false;
                    } catch (error) {
                        console.error('Error fetching products: ', error)
                    }
                },
                skeletonLoaderVisibility (visibility) {
                    const skeletonLoaderContainer = document.getElementById('skeleton-loader');
                    skeletonLoaderContainer.style.display = visibility
                },
                filtersSkeletonLoaderVisibility (visibility) {
                    const filtersSkeletonLoader = document.getElementById('filters-skeleton-loader');
                    filtersSkeletonLoader.style.display = visibility
                },
                productsSkeletonLoaderVisibility (visibility) {
                    const productSkeletonLoader = document.getElementById('products-skeleton-loader');
                    productSkeletonLoader.style.display = visibility
                },
                gridSkeletonLoaderVisibility (visibility) {
                    const gridSkeletonLoader = document.getElementById('products-grid-skeleton-loader');            
                    for (let i = 0; i < 20; i++) {
                        const skeletonLoaderCard = document.createElement('div');
                        skeletonLoaderCard.classList.add('skeleton-card');
                        skeletonLoaderCard.innerHTML = `
                        <div class="skeleton-card__image skeleton-loading" style="display: block !important"></div>
                        <div class="skeleton-card__title skeleton-loading" style="display: block !important"></div>
                        <div class="skeleton-card__description skeleton-loading" style="display: block !important"></div>`
                        gridSkeletonLoader.appendChild(skeletonLoaderCard);
                    }
                    gridSkeletonLoader.style.display = visibility
                },
                productGridContainerVisibility (visibility) {
                    const productGridContainer = document.getElementById('ProductGridContainer');
                    productGridContainer.style.display = visibility
                },
                collectionProductsVisibility (visibility) {
                    const collectionProducts = document.getElementById('collection-products');
                    collectionProducts.style.display = visibility
                },
                dateFormat (date) {
                    const day = date.getDate();
                    const month = date.getMonth() + 1;
                    const year = date.getFullYear();

                    return `${day}-${month}-${year}`;
                },
                async handleSubmit () {
                    const queryParams = {
                        text_filter: this.service,
                        date_range: [this.startDate, this.endDate],
                    }

                    if (!this.startDate || !this.endDate) {
                        delete queryParams.date_range
                    }
                    if (!this.service) {
                        delete queryParams.text_filter
                    }
                    
                    const encodedQueryParams = encodeURIComponent(JSON.stringify(queryParams));
                    this.filtersSkeletonLoaderVisibility('none')
                    this.gridSkeletonLoaderVisibility('flex')
                    this.productGridContainerVisibility('none')

                    await this.fetchProducts(encodedQueryParams)

                    this.offerSuccess = true
                    this.gridSkeletonLoaderVisibility('none')
                    this.productGridContainerVisibility('block')


                },
                async loadMore () {
                    this.loadingMore = true
                    const queryParams = {
                        text_filter: this.service,
                        date_range: [this.startDate, this.endDate],
                    }

                    if (!this.startDate || !this.endDate) {
                        delete queryParams.date_range
                    }
                    if (!this.service) {
                        delete queryParams.text_filter
                    }

                    const encodedQueryParams = encodeURIComponent(JSON.stringify(queryParams));
                    const response = await fetch(`${this.next_page_url}&query=${encodedQueryParams}&shop_domain=${Shopify.shop}`)
                    const {data} = await response.json()
                    this.next_page_url = data.next_page_url
                    this.products = [...this.products, ...data.data]
                    this.loadingMore = false
                },
                getISO (dateString) {
                    console.log('The dateString: ', dateString);
                    const [day, month, year] = dateString.split('-'); // Split into components

                    return `${year}-${month}-${day}`;
                },
                async fetchProductData () {
                    const startDate = this.getISO(new URLSearchParams(window.location.search).get('from'))
                    const endDate = this.getISO(new URLSearchParams(window.location.search).get('to'))
                    const service = new URLSearchParams(window.location.search).get('q')
                    
                    this.startDate = startDate ? new Date(startDate)  : null
                    this.endDate = endDate ? new Date(endDate) : null
                    this.service = service
                    
                    const queryParams = {
                        text_filter: service || null,
                        date_range: [startDate, endDate] || [],
                    }

                    if (!startDate || !endDate) {
                        delete queryParams.date_range
                    }
                    if (!this.service) {
                        delete queryParams.text_filter
                    }

                    const encodedQueryParams = encodeURIComponent(JSON.stringify(queryParams));

                    console.log('The encodedQueryParams: ', encodedQueryParams)
                    await this.fetchProducts(encodedQueryParams);
                    this.filtersSkeletonLoaderVisibility('none')
                    this.productsSkeletonLoaderVisibility('none')
                    this.collectionProductsVisibility('block')
              
                }
            },
            mounted () {
                try {
                    console.log('The mounted eventorium')
                    this.fetchProductData()
                } catch (error) {
                    console.error('Error fetching products: ', error)
                }
            },
            delimiters: ['$%', '%']
        };
        
        const vueApp = Vue.createApp(App)
        vueApp.component('flat-pickr', VueFlatpickr.default);
        vueApp.mount('#collection-products');
    })