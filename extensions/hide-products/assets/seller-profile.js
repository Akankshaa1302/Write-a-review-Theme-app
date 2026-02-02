;(function () {
    const { createApp, ref, computed, onMounted, watch } = Vue
    const { createRouter, createWebHashHistory } = VueRouter
    const { createI18n } = VueI18n
    const { useToast } = PrimeVue

    // API Base URL
    const API_BASE_URL = 'https://api.shipturtle.com'

    // Locale detection from Shopify theme
    const getShopifyLocale = () => {
        // Try to get locale from Shopify Liquid or fall back to browser language
        const shopifyLocale = document.documentElement.lang || 
                             document.querySelector('html')?.getAttribute('lang') ||
                             window.Shopify?.locale ||
                             navigator.language.split('-')[0]
        
        // Map Shopify locales to our supported locales
        const supportedLocales = ['en', 'de', 'es', 'nl', 'pt']
        const normalizedLocale = shopifyLocale.toLowerCase().split('-')[0]
        
        return supportedLocales.includes(normalizedLocale) ? normalizedLocale : 'en'
    }

    // Load locale messages and settings
    const loadLocaleMessages = async () => {
        const locale = getShopifyLocale()
        
        try {
            const appElement = document.getElementById('seller-profile-app')
            const langJSONUrl = appElement?.getAttribute('data-lang-asset')
            
            if (!langJSONUrl) {
                console.warn('No locale URL found, falling back to embedded messages')
                return { messages: { en: {} }, locale: 'en' }
            }
            
            // Load lang.json which contains all locales
            const response = await fetch(langJSONUrl)
            const messages = await response.json()
            
            // Ensure English exists as fallback
            if (!messages.en) {
                messages.en = {}
            }
            
            return { messages, locale }
        } catch (error) {
            console.error('Failed to load locale messages:', error)
            return { messages: { en: {} }, locale: 'en' }
        }
    }

    // Load block settings
    const loadBlockSettings = () => {
        try {
            const appElement = document.getElementById('seller-profile-app')
            const settingsData = appElement?.getAttribute('data-settings')
            
            if (settingsData) {
                return JSON.parse(settingsData)
            }
            
            // Return default settings if none found
            return {
                vendorsPerRow: 3,
                vendorsPerPage: 12,
                showVendorRatings: true,
                productsPerPage: 10,
                vendorTerm: 'Vendor',
                vendorTermPlural: 'Vendors',
                productTerm: 'Product',
                productTermPlural: 'Products'
            }
        } catch (error) {
            console.error('Failed to load block settings:', error)
            return {}
        }
    }

    // Helper function to get terminology with fallback
    const getTerminology = (blockSettings) => {
        return {
            vendor: blockSettings.vendorTerm || 'Vendor',
            vendors: blockSettings.vendorTermPlural || 'Vendors',
            product: blockSettings.productTerm || 'Product', 
            products: blockSettings.productTermPlural || 'Products'
        }
    }

    // Vendor List component
        // LocalStorage key for vendor list state
        const VENDOR_LIST_STATE_KEY = 'shipturtle_vendor_list_state'
        
        // Default state
        const defaultVendorListState = {
            first: 0,
            filters: {
                search: '',
                country: null,
                state: null,
                vendorCategory: null,
                productCategory: null
            }
        }

        // Load state from localStorage
        const loadVendorListState = () => {
            try {
                const saved = localStorage.getItem(VENDOR_LIST_STATE_KEY)
                return saved ? JSON.parse(saved) : { ...defaultVendorListState }
            } catch (error) {
                console.warn('Failed to load vendor list state from localStorage:', error)
                return { ...defaultVendorListState }
            }
        }

        // Save state to localStorage
        const saveVendorListStateToStorage = (state) => {
            try {
                localStorage.setItem(VENDOR_LIST_STATE_KEY, JSON.stringify(state))
            } catch (error) {
                console.warn('Failed to save vendor list state to localStorage:', error)
            }
        }

        // Initialize state from localStorage
        const vendorListState = loadVendorListState()

    const VendorList = {
        name: 'VendorList',
        props: {
            terminology: {
                type: Object,
                default: () => ({
                    vendor: 'Vendor',
                    vendors: 'Vendors', 
                    product: 'Product',
                    products: 'Products'
                })
            }
        },
        template: `
            <div class="st-ext-container st-ext-max-w-7xl st-ext-mx-auto st-ext-px-3 st-ext-md:st-ext-px-4 st-ext-lg:st-ext-px-6 st-ext-py-4 st-ext-md:st-ext-py-6">
                <!-- Banner Section -->
                <p-skeleton v-if="loading" width="100%" style="height: var(--sp-vendor-listing-banner-height);" class="st-ext-mb-4"></p-skeleton>
                 <div v-else-if="parentCompany?.promo_banner && !parentCompany?.hide_promo_banner" class="st-ext-relative st-ext-bg-gray-200 st-ext-border-round-2xl st-ext-overflow-hidden" style="height: var(--sp-vendor-listing-banner-height); max-height: var(--sp-vendor-listing-banner-height);">
                        <p-image
                            :src="parentCompany?.promo_banner"
                            alt="Vendors Banner"
                            image-class="st-ext-w-full st-ext-h-full st-ext-object-cover st-ext-border-round-2xl"
                            style="height: 100%; width: 100%; display: block;"
                        ></p-image>
                </div>
                <div class="st-ext-text-center st-ext-mb-6 st-ext-mt-4">
                    <p-skeleton v-if="loading" width="20rem" height="2rem" class="st-ext-mx-auto"></p-skeleton>
                    <h2 v-else class="st-ext-text-2xl st-ext-font-semibold">[[ pageTitle ]]</h2>
                </div>

                <div class="st-ext-grid">
                    <!-- Mobile Search and Filter Toggle -->
                    <div  v-if="isMobile" class="st-ext-col-12 st-ext-block st-ext-sm:st-ext-hidden st-ext-mb-4" >
                        <div class="st-ext-flex st-ext-gap-2">
                            <div class="st-ext-flex-1">
                                <p-input-text v-model="filters.search" :placeholder="searchVendorText" class="st-ext-w-full st-ext-h-fullst-ext-text-sm"></p-input-text>
                            </div>
                            <p-button
                                v-if="!showFilters"
                                @click="showFilters = true"
                                icon="pi pi-filter"
                                outlined
                                :label="$t('sellers.filters')"></p-button>
                            <p-button
                                v-if="hasActiveFilters"
                                @click="clearFilters"
                                icon="pi pi-times"
                                outlined
                                severity="secondary"
                                :label="$t('sellers.clear')"></p-button>
                        </div>
                        
                        <!-- Active Filter Badges -->
                        <div v-if="hasActiveFilters" class="st-ext-flex st-ext-flex-wrap st-ext-gap-2 st-ext-mt-3">
                            <span v-if="filters.search" class="st-ext-inline-flex st-ext-align-items-center st-ext-gap-1 st-ext-px-3 st-ext-py-1 st-ext-bg-blue-100 st-ext-text-blue-800 st-ext-text-sm st-ext-rounded-full">
                                [[ $t('sellers.filter.search', { query: filters.search }) ]]
                                <i class="pi pi-times st-ext-cursor-pointer st-ext-text-xs" @click="removeFilter('search')"></i>
                            </span>
                            <span v-if="filters.country" class="st-ext-inline-flex st-ext-align-items-center st-ext-gap-1 st-ext-px-3 st-ext-py-1 st-ext-bg-green-100 st-ext-text-green-800 st-ext-text-sm st-ext-rounded-full">
                                [[ $t('sellers.filter.country', { country: getCountryName(filters.country) }) ]]
                                <i class="pi pi-times st-ext-cursor-pointer st-ext-text-xs" @click="removeFilter('country')"></i>
                            </span>
                            <span v-if="filters.state" class="st-ext-inline-flex st-ext-align-items-center st-ext-gap-1 st-ext-px-3 st-ext-py-1 st-ext-bg-yellow-100 st-ext-text-yellow-800 st-ext-text-sm st-ext-rounded-full">
                                [[ $t('sellers.filter.state', { state: filters.state }) ]]
                                <i class="pi pi-times st-ext-cursor-pointer st-ext-text-xs" @click="removeFilter('state')"></i>
                            </span>
                            <span v-if="filters.vendorCategory" class="st-ext-inline-flex st-ext-align-items-center st-ext-gap-1 st-ext-px-3 st-ext-py-1 st-ext-bg-purple-100 st-ext-text-purple-800 st-ext-text-sm st-ext-rounded-full">
                                [[ $t('sellers.filter.vendorCategory', { category: getVendorCategoryName(filters.vendorCategory) }) ]]
                                <i class="pi pi-times st-ext-cursor-pointer st-ext-text-xs" @click="removeFilter('vendorCategory')"></i>
                            </span>
                            <span v-if="filters.productCategory" class="st-ext-inline-flex st-ext-align-items-center st-ext-gap-1 st-ext-px-3 st-ext-py-1 st-ext-bg-orange-100 st-ext-text-orange-800 st-ext-text-sm st-ext-rounded-full">
                                [[ $t('sellers.filter.productCategory', { category: getProductCategoryName(filters.productCategory) }) ]]
                                <i class="pi pi-times st-ext-cursor-pointer st-ext-text-xs" @click="removeFilter('productCategory')"></i>
                            </span>
                        </div>
                    </div>

                    <!-- Filters Sidebar -->
                    <div class="st-ext-col-12 st-ext-sm:st-ext-col-2" :class="{ 'st-ext-hidden': !showFilters && isMobile }">
                        <div v-if="loading" class="st-ext-flex st-ext-flex-column st-ext-gap-4">
                            <!-- Search skeleton -->
                            <div>
                                <p-skeleton width="4rem" height="1rem" class="st-ext-mb-2"></p-skeleton>
                                <p-skeleton width="100%" height="2.5rem"></p-skeleton>
                            </div>
                            
                            <!-- Filter skeletons -->
                            <div v-for="n in 4" :key="n">
                                <p-skeleton width="6rem" height="1rem" class="st-ext-mb-2"></p-skeleton>
                                <p-skeleton width="100%" height="2.5rem"></p-skeleton>
                            </div>
                            
                            <!-- Button skeletons -->
                            <div class=" st-ext-flex st-ext-flex-column st-ext-gap-3 st-ext-pt-4">
                                <p-skeleton width="100%" height="2.5rem"></p-skeleton>
                                <p-skeleton width="100%" height="2.5rem"></p-skeleton>
                            </div>
                        </div>

                        <div v-else class="st-ext-flex st-ext-flex-column st-ext-gap-4">
                            <div class="st-ext-hidden st-ext-sm:block">
                                <label class="st-ext-block st-ext-text-medium st-ext-font-medium st-ext-mb-2">[[ searchVendorText ]]</label>
                                <div class="st-ext-w-full">
                                    <p-input-text v-model="filters.search" :placeholder="searchVendorText" class="st-ext-w-full st-ext-h-full st-ext-text-sm"></p-input-text>
                                </div>
                            </div>

                            <div v-if="showCountryState">
                                <label class="st-ext-block st-ext-font-medium st-ext-mb-2">[[ $t('sellers.country') ]]</label>
                                <p-select :options="countryOptions" optionLabel="name" optionValue="code" :placeholder="$t('sellers.all')" class="st-ext-w-full st-ext-text-sm vendor-dropdown" v-model="filters.country" @change="onCountryChange" :showClear="true"></p-select>
                            </div>

                            <div v-if="showCountryState">
                                <label class="st-ext-block  st-ext-font-medium st-ext-mb-2">[[ $t('sellers.state') ]]</label>
                                <p-select :options="stateOptions" optionLabel="name" optionValue="name" :placeholder="$t('sellers.selectState')" class="st-ext-w-full st-ext-text-sm vendor-dropdown" v-model="filters.state" :disabled="!filters.country" :showClear="true"></p-select>
                            </div>

                            <div v-if="showVendorCategory">
                                <label class="st-ext-block  st-ext-font-medium st-ext-mb-2">[[ $t('sellers.vendorCategory') ]]</label>
                                <p-select :options="vendorCategoryOptions" optionLabel="name" optionValue="id" :placeholder="$t('sellers.all')" class="st-ext-w-full st-ext-text-sm vendor-dropdown" v-model="filters.vendorCategory" :showClear="true"></p-select>
                            </div>

                            <div v-if="showProductCategory">
                                <label class="st-ext-block st-ext-font-medium st-ext-mb-2">[[ $t('sellers.productCategory') ]]</label>
                                <p-select :options="productCategoryOptions" optionLabel="title" optionValue="id" :placeholder="$t('sellers.all')" class="st-ext-w-full st-ext-text-sm vendor-dropdown" v-model="filters.productCategory" :showClear="true"></p-select>
                            </div>

                            <div class=" st-ext-flex st-ext-flex-column st-ext-gap-3 st-ext-pt-4">
                                <p-button :label="$t('sellers.apply')" class="st-ext-w-full" @click="applyFilters" />
                                <p-button :label="$t('sellers.clear')" outlined class="st-ext-w-full st-ext-border-gray-300 st-ext-text-gray-700" @click="clearFilters" :disabled="!hasActiveFilters" />
                                <p-button 
                                    v-if="isMobile"
                                    :label="$t('sellers.vendorDetails.closeFilters')" 
                                    icon="pi pi-times"
                                    outlined 
                                    class="st-ext-w-full st-ext-border-gray-300 st-ext-text-gray-700" 
                                    @click="showFilters = false" />
                            </div>
                        </div>
                    </div>

                    <!-- Vendors Grid -->
                    <div class="st-ext-col-12 st-ext-sm:st-ext-col-10">
                        <div v-if="loading" class="st-ext-grid st-ext-grid-nogutter">
                            <div v-for="n in 6" :key="n" class="st-ext-col-12 st-ext-sm:st-ext-col-6 st-ext-md:st-ext-col-4 st-ext-lg:st-ext-col-3 st-ext-p-2">
                                <div class="st-ext-bg-white st-ext-rounded-lg st-ext-border st-ext-border-gray-200 st-ext-p-2 st-ext-shadow-sm st-ext-border-round-xl st-ext-border-2 st-ext-h-full st-ext-flex st-ext-flex-column">
                                    <!-- Header with avatar and title -->
                                    <div class="st-ext-flex st-ext-items-start st-ext-gap-3 st-ext-mb-3">
                                        <p-skeleton shape="circle" size="3rem"></p-skeleton>
                                        <div class="st-ext-flex-1 st-ext-min-w-0">
                                            <p-skeleton width="70%" height="1.25rem" class="st-ext-mb-2"></p-skeleton>
                                            <p-skeleton width="50%" height="0.75rem"></p-skeleton>
                                        </div>
                                    </div>
                                    
                                    <!-- Description and rating -->
                                    <div class="st-ext-mb-2 st-ext-flex-1">
                                        <p-skeleton width="100%" height="1rem" class="st-ext-mb-2"></p-skeleton>
                                        <p-skeleton width="80%" height="1rem" class="st-ext-mb-3"></p-skeleton>
                                        <div class="st-ext-flex st-ext-items-center st-ext-gap-2">
                                            <p-skeleton width="5rem" height="0.75rem"></p-skeleton>
                                            <p-skeleton width="4rem" height="0.75rem"></p-skeleton>
                                        </div>
                                    </div>
                                    
                                    <!-- Button -->
                                    <p-skeleton width="100%" height="2.5rem" borderRadius="0.375rem"></p-skeleton>
                                </div>
                            </div>
                        </div>

                        <div v-else>
                            <div class="st-ext-flex st-ext-justify-content-center st-ext-align-items-center st-ext-mb-4">
                                <div class="st-ext-text-sm st-ext-text-gray-600">[[ totalCount ]] results</div>
                            </div>
                            <div class="st-ext-grid st-ext-grid-nogutter">
                                <div v-for="vendor in vendors" :key="vendor.id || vendor.vendor_id" class="st-ext-col-12 st-ext-sm:st-ext-col-6 st-ext-md:st-ext-col-4 st-ext-lg:st-ext-col-3 st-ext-p-2">
                                    <div class="st-ext-bg-white st-ext-rounded-lg st-ext-border st-ext-border-gray-200 st-ext-p-3 st-ext-shadow-sm st-ext-border-round-xl st-ext-border-2 st-ext-h-full st-ext-flex st-ext-flex-column">
                                    <div class="st-ext-flex st-ext-align-items-start st-ext-gap-3 st-ext-mb-3">
                                        <p-image
                                        v-if="vendor.logo_link && !isDefaultLogoLink(vendor.logo_link)"
                                        :src="vendor.logo_link"
                                        :alt="[[ vendor.brand_name || vendor.title ]]"
                                        image-class="st-ext-object-cover st-ext-border-circle st-ext-h-full st-ext-w-full"
                                        style="object-fit: cover; width: 50px; height: 50px; display: block"></p-image>

                                        <div v-else class="st-ext-border-circle st-ext-bg-gray-200 st-ext-flex st-ext-align-items-center st-ext-justify-content-center st-ext-font-medium st-ext-text-gray-600 st-ext-flex-shrink-0 st-ext-text-white"
                                        :class="getLetterBackgroundColor((vendor.brand_name || vendor.title)?.charAt(0) || '')"
                                        style="width: 50px; height: 50px;">
                                            [[ (vendor.brand_name || vendor.title)?.charAt(0)?.toUpperCase() ]]
                                        </div>
                                        <div class="st-ext-flex-1 st-ext-min-w-0">
                                            <h3 class="st-ext-font-medium st-ext-text-base st-ext-text-gray-900 st-ext-m-0 st-ext-mb-1 st-ext-capitalize">[[ vendor.brand_name || vendor.title ]]</h3>
                                            <div class="st-ext-text-xs st-ext-text-gray-500" v-if="showLocation">
                                                [[ vendor.city || vendor.state || '' ]][[ vendor.country ? (vendor.city || vendor.state ? ', ' : '') + vendor.country_detail?.name : '' ]]
                                            </div>
                                            <div v-if="parentCompany?.display_vendor_category && vendor.attributes?.category?.name" class="st-ext-text-gray-500 st-ext-mb-1 st-ext-text-xs">[[ terminology.vendor ]] Category: [[ vendor.attributes?.category?.name ]]</div>
                                        </div>
                                    </div>
                                    
                                    <div class="st-ext-mb-2 st-ext-flex-1">
                                        <div v-if="parentCompany?.display_vendor_short_description" class="st-ext-text-sm st-ext-text-gray-600 st-ext-mb-2">[[ truncateHtml(vendor.short_description, 150) ]]</div>
                                        </div>
                                        <div v-if="parentCompany?.vendor_profile_settings?.seller_reviews_tab && blockSettings.showVendorRatings" class="st-ext-flex st-ext-align-items-center st-ext-gap-2 st-ext-text-xs st-ext-text-gray-500">
                                            <div class="st-ext-flex st-ext-align-items-center st-ext-gap-1 st-ext-text-yellow-400">
                                                <i
                                                    v-for="star in 5"
                                                    :key="star"
                                                    :class="star <= Math.round(getVendorAverageRating(vendor)) ? 'pi pi-star-fill' : 'pi pi-star'"
                                                ></i>
                                            </div>
                                            <span>([[ getVendorReviewsCount(vendor) ]] Reviews)</span>
                                        </div>
                                    <router-link :to="{ name: 'vendor-details', params: { handle: vendor.slug || (vendor.title || '').toLowerCase().replace(/\s+/g, '-') } }" @click="saveVendorListState">
                                        <p-button :label="$t('sellers.details')" size="small" class="st-ext-w-full st-ext-mt-3 st-ext-border-noround"></p-button>
                                    </router-link>
                                </div>
                            </div>
                            </div>

                            <div class="st-ext-mt-6" v-if="totalCount > pageSize">
                                <p-paginator :rows="pageSize" :totalRecords="totalCount" v-model:first="first" @page="onPage" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,
        setup(props) {
            const { t, locale  } = VueI18n.useI18n()
            const vendors = ref([])
            const totalCount = ref(0)
            const loading = ref(true)
            const blockSettings = ref(loadBlockSettings())

            // Get terminology from props or settings
            const terminology = computed(() => props.terminology || getTerminology(blockSettings.value))

            // Dynamic translations with terminology
            const dynamicTranslations = computed(() => ({
                searchPlaceholder: t('sellers.searchVendors').replace('vendors', terminology.value.vendors.toLowerCase()),
                loadingText: t('sellers.loadingVendors').replace('vendors', terminology.value.vendors.toLowerCase()),
                noResultsText: t('sellers.noVendorsFound').replace('vendors', terminology.value.vendors.toLowerCase()),
                backToList: t('sellers.vendorDetails.backToVendors').replace('vendors', terminology.value.vendors),
                showingResults: (start, end, total) => t('sellers.showingResults', { start, end, total }).replace('vendors', terminology.value.vendors.toLowerCase()),
                searchVendorText: `Search ${terminology.value.vendor}`
            }))

            const searchVendorText = computed (() => {
                if (locale.value === 'en') return dynamicTranslations.value.searchVendorText
                else return t('sellers.searchVendor')
            })

            const countryOptions = ref([])
            const stateOptions = ref([])
            const vendorCategoryOptions = ref([])
            const productCategoryOptions = ref([])

            const parentCompany = ref(null)
            const pageTitle = computed(() => parentCompany.value?.name_of_the_vendor_listing_page)
            const showLocation = computed(() => !!parentCompany.value?.display_vendor_location)
            const showCountryState = computed(() => !!parentCompany.value?.vendor_profile_settings?.filter_country_and_state)
            const showVendorCategory = computed(() => !!parentCompany.value?.vendor_profile_settings?.filter_vendor_category)
            const showProductCategory = computed(() => !!parentCompany.value?.vendor_profile_settings?.filter_product_category)

            const pageSize = ref(blockSettings.value.vendorsPerPage)
            const first = ref(vendorListState.first)

            const filters = ref({
                search: vendorListState.filters.search,
                country: vendorListState.filters.country,
                state: vendorListState.filters.state,
                vendorCategory: vendorListState.filters.vendorCategory,
                productCategory: vendorListState.filters.productCategory
            })

            const showFilters = ref(false)
            const isMobile = ref(window.innerWidth < 640)

            const hasActiveFilters = computed(() => {
                return !!(filters.value.search || 
                         filters.value.country || 
                         filters.value.state || 
                         filters.value.vendorCategory || 
                         filters.value.productCategory)
            })

            const urlParams = new URLSearchParams(window.location.search)
            const shop = urlParams.get('shop') || ''

            const buildVendorsUrl = () => {
                const page = Math.floor(first.value / pageSize.value) + 1
                const base = `/a/dashboard/vendors-list?shop=${Shopify.shop}&page=${page}&limit=${pageSize.value}`
                const parts = []
                if (filters.value.search) parts.push(`search_key=${encodeURIComponent(filters.value.search)}`)
                if (filters.value.country) parts.push(`country=${encodeURIComponent(filters.value.country)}`)
                if (filters.value.state) parts.push(`state=${encodeURIComponent(filters.value.state)}`)
                if (filters.value.vendorCategory) parts.push(`vendor_category_id=${encodeURIComponent(filters.value.vendorCategory)}`)
                if (filters.value.productCategory) parts.push(`product_type=${encodeURIComponent(filters.value.productCategory)}`)
                return base + (parts.length ? `&${parts.join('&')}` : '')
            }

            const fetchCountries = async () => {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/v1/country`)
                    const data = await res.json()
                    countryOptions.value = Array.isArray(data) ? data : []
                } catch (e) {
                    countryOptions.value = []
                }
            }

            const fetchStates = async (countryCode) => {
                if (!countryCode) { stateOptions.value = []; return }
                try {
                    const url = `${API_BASE_URL}/api/v1/states/${encodeURIComponent(countryCode)}/${encodeURIComponent('{"title": ""}')}`
                    const res = await fetch(url)
                    const { data } = await res.json()
                    // API returns array of objects with country_code and title keys
                    stateOptions.value = Array.isArray(data) ? data.map(state => ({
                        name: state.title,
                        code: state.country_code
                    })) : []
                } catch (e) {
                    stateOptions.value = []
                }
            }

            const fetchVendors = async () => {
                loading.value = true
                try {
                    const res = await fetch(buildVendorsUrl())
                    const payload = await res.json()
                    
                    if (payload.success) {
                        vendors.value = Array.isArray(payload.data?.vendors) ? payload.data.vendors : []
                        totalCount.value = Number(payload.data?.count || 0)
                        parentCompany.value = payload.data?.parent_company || null
                        vendorCategoryOptions.value = Array.isArray(payload.data?.vendor_categories) ? payload.data.vendor_categories : []
                        productCategoryOptions.value = Array.isArray(payload.data?.product_categories) ? payload.data.product_categories : []
                    } else {
                        console.error('Failed to fetch vendors:', payload.message)
                        vendors.value = []
                        totalCount.value = 0
                    }
                } catch (e) {
                    console.error('Error fetching vendors:', e)
                    vendors.value = []
                    totalCount.value = 0
                } finally {
                    loading.value = false
                }
            }

            const onCountryChange = async () => {
                filters.value.state = null
                await fetchStates(filters.value.country)
            }

            const onPage = (event) => {
                first.value = event.first
                // Save pagination state
                vendorListState.first = event.first
                saveVendorListStateToStorage(vendorListState)
                fetchVendors()
            }

            const applyFilters = () => {
                first.value = 0
                vendorListState.first = 0
                saveVendorListStateToStorage(vendorListState)
                fetchVendors()
                if (isMobile.value) {
                    showFilters.value = false
                }
            }

            const clearFilters = () => {
                filters.value = { search: '', country: null, state: null, vendorCategory: null, productCategory: null }
                stateOptions.value = []
                first.value = 0
                vendorListState.first = 0
                vendorListState.filters = { search: '', country: null, state: null, vendorCategory: null, productCategory: null }
                saveVendorListStateToStorage(vendorListState)
                fetchVendors()
                if (isMobile.value) {
                    showFilters.value = false
                }
            }

            const removeFilter = (filterType) => {
                if (filterType === 'search') {
                    filters.value.search = ''
                } else if (filterType === 'country') {
                    filters.value.country = null
                    filters.value.state = null // Also clear state when country is removed
                    stateOptions.value = []
                } else if (filterType === 'state') {
                    filters.value.state = null
                } else if (filterType === 'vendorCategory') {
                    filters.value.vendorCategory = null
                } else if (filterType === 'productCategory') {
                    filters.value.productCategory = null
                }
                first.value = 0
                vendorListState.first = 0
                saveVendorListStateToStorage(vendorListState)
                fetchVendors()
            }

            const getCountryName = (countryCode) => {
                const country = countryOptions.value.find(c => c.code === countryCode)
                return country ? country.name : countryCode
            }

            const getVendorCategoryName = (categoryId) => {
                const category = vendorCategoryOptions.value.find(c => c.id === categoryId)
                return category ? category.name : categoryId
            }

            const getProductCategoryName = (categoryId) => {
                const category = productCategoryOptions.value.find(c => c.id === categoryId)
                return category ? category.title : categoryId
            }

            // Save filter state when filters change
            watch(filters, (newFilters) => {
                vendorListState.filters = { ...newFilters }
                saveVendorListStateToStorage(vendorListState)
            }, { deep: true })

            // Function to save current state (called when navigating to vendor details)
            const saveVendorListState = () => {
                vendorListState.first = first.value
                vendorListState.filters = { ...filters.value }
                saveVendorListStateToStorage(vendorListState)
            }

            onMounted(async () => {
                // document.getElementById('st-ext-seller-profile-container').style.display = "block"
                await fetchCountries()
                
                // If we have saved state with country, fetch states for that country
                if (filters.value.country) {
                    await fetchStates(filters.value.country)
                }
                
                await fetchVendors()
            })

            const displayVendors = computed(() => {
                // const hideNoProducts = !!parentCompany.value?.vendor_profile_settings?.do_not_list_vendors_without_products
                // if (!hideNoProducts) return vendors.value
                return vendors.value.filter(v => v.has_products)
            })

            function getLetterBackgroundColor(letter) {
                const colors = [
                  'st-ext-bg-gradient-to-br st-ext-from-blue-500 st-ext-to-blue-600',
                  'st-ext-bg-gradient-to-br st-ext-from-green-500 st-ext-to-green-600',
                  'st-ext-bg-gradient-to-br st-ext-from-purple-500 st-ext-to-purple-600',
                  'st-ext-bg-gradient-to-br st-ext-from-red-500 st-ext-to-red-600',
                  'st-ext-bg-gradient-to-br st-ext-from-yellow-500 st-ext-to-yellow-600',
                  'st-ext-bg-gradient-to-br st-ext-from-pink-500 st-ext-to-pink-600',
                  'st-ext-bg-gradient-to-br st-ext-from-indigo-500 st-ext-to-indigo-600',
                  'st-ext-bg-gradient-to-br st-ext-from-teal-500 st-ext-to-teal-600',
                  'st-ext-bg-gradient-to-br st-ext-from-orange-500 st-ext-to-orange-600',
                  'st-ext-bg-gradient-to-br st-ext-from-cyan-500 st-ext-to-cyan-600',
                  'st-ext-bg-gradient-to-br st-ext-from-emerald-500 st-ext-to-emerald-600',
                  'st-ext-bg-gradient-to-br st-ext-from-rose-500 st-ext-to-rose-600',
                  'st-ext-bg-gradient-to-br st-ext-from-violet-500 st-ext-to-violet-600',
                  'st-ext-bg-gradient-to-br st-ext-from-amber-500 st-ext-to-amber-600',
                  'st-ext-bg-gradient-to-br st-ext-from-lime-500 st-ext-to-lime-600',
                  'st-ext-bg-gradient-to-br st-ext-from-sky-500 st-ext-to-sky-600',
                  'st-ext-bg-gradient-to-br st-ext-from-fuchsia-500 st-ext-to-fuchsia-600',
                  'st-ext-bg-gradient-to-br st-ext-from-slate-500 st-ext-to-slate-600',
                  'st-ext-bg-gradient-to-br st-ext-from-zinc-500 st-ext-to-zinc-600',
                  'st-ext-bg-gradient-to-br st-ext-from-neutral-500 st-ext-to-neutral-600',
                  'st-ext-bg-gradient-to-br st-ext-from-stone-500 st-ext-to-stone-600',
                  'st-ext-bg-gradient-to-br st-ext-from-gray-500 st-ext-to-gray-600',
                  'st-ext-bg-gradient-to-br st-ext-from-slate-400 st-ext-to-slate-500',
                  'st-ext-bg-gradient-to-br st-ext-from-zinc-400 st-ext-to-zinc-400',
                  'st-ext-bg-gradient-to-br st-ext-from-neutral-400 st-ext-to-neutral-400',
                  'st-ext-bg-gradient-to-br st-ext-from-stone-400 st-ext-to-stone-400',
                  'st-ext-bg-gradient-to-br st-ext-from-gray-400 st-ext-to-gray-400'
                ];
                
                const charCode = letter.toUpperCase().charCodeAt(0);
                const index = (charCode - 65) % colors.length; // A=0, B=1, C=2, etc.
                return colors[index];
            }

            const isDefaultLogoLink = (logoLink) => {
                return logoLink === `${API_BASE_URL}/assets/no-logo.jpeg` || logoLink === 'https://api.shipturtle.com/assets/no-logo.png';
            }

            const truncateHtml = (html, maxLen = 100) => {
                if (!html) return ''
                const tmp = document.createElement('div')
                tmp.innerHTML = String(html)
                const text = tmp.textContent || tmp.innerText || ''
                if (text.length <= maxLen) return text
                return text.slice(0, maxLen).trimEnd() + '…'
            }

            // Reviews helpers for vendor cards
            const getVendorReviewsCount = (vendor) => {
                const list = Array.isArray(vendor?.reviews) ? vendor.reviews : []
                return list.length
            }

            const getVendorAverageRating = (vendor) => {
                const list = Array.isArray(vendor?.reviews) ? vendor.reviews : []
                if (list.length === 0) return 0
                const total = list.reduce((sum, r) => sum + Number(r?.ratings || 0), 0)
                const avg = total / list.length
                return isFinite(avg) ? avg : 0
            }

            return {
                // state
                vendors,
                parentCompany,
                totalCount,
                loading,
                pageTitle,
                showLocation,
                showCountryState,
                showVendorCategory,
                showProductCategory,
                countryOptions,
                stateOptions,
                vendorCategoryOptions,
                productCategoryOptions,
                filters,
                pageSize,
                first,
                displayVendors,
                showFilters,
                isMobile,
                hasActiveFilters,
                blockSettings,
                terminology,
                dynamicTranslations,
                searchVendorText,
                // methods
                onCountryChange,
                onPage,
                applyFilters,
                clearFilters,
                removeFilter,
                getCountryName,
                getVendorCategoryName,
                getProductCategoryName,
                getLetterBackgroundColor,
                isDefaultLogoLink,
                truncateHtml,
                getVendorReviewsCount,
                getVendorAverageRating,
                saveVendorListState
            }
        }
    }

    // Vendor Details component
    const VendorDetails = {
        name: 'VendorDetails',
        props: {
            terminology: {
                type: Object,
                default: () => ({
                    vendor: 'Vendor',
                    vendors: 'Vendors',
                    product: 'Product', 
                    products: 'Products'
                })
            }
        },
        template: `
            <div class="st-ext-container st-ext-max-w-7xl st-ext-mx-auto st-ext-px-3 st-ext-md:st-ext-px-4 st-ext-lg:st-ext-px-6 st-ext-py-4 st-ext-md:st-ext-py-6">
                <!-- Back Button -->
                <div class="st-ext-mb-4">
                    <router-link to="/">
                        <p-button icon="pi pi-arrow-left" :label="'Back to ' + terminology.vendors" outlined size="small" />
                    </router-link>
                </div>

                <!-- Loading State -->
                <div v-if="loading" class="st-ext-w-full">
                    <!-- Hero Section Skeleton -->
                    <div class="st-ext-relative st-ext-mb-6">
                        <p-skeleton width="100%" height="20rem" class="st-ext-mb-4"></p-skeleton>
                        <div class="st-ext-flex st-ext-gap-4 st-ext-align-items-center">
                            <p-skeleton :size="isMobile ? '6rem' : '12rem'"></p-skeleton>
                            <div class="st-ext-flex-1">
                                <p-skeleton width="15rem" height="2rem" class="st-ext-mb-2"></p-skeleton>
                                <p-skeleton width="8rem" height="1rem" class="st-ext-mb-2"></p-skeleton>
                                <p-skeleton width="20rem" height="1rem"></p-skeleton>
                            </div>
                        </div>
                    </div>
                    <!-- Tabs Skeleton -->
                    <div class="st-ext-flex st-ext-justify-content-center st-ext-gap-4 st-ext-mb-4">
                        <p-skeleton v-for="n in 6" :key="n" width="5rem" height="2.5rem"></p-skeleton>
                    </div>
                    <p-skeleton width="100%" height="15rem"></p-skeleton>
                </div>

                <!-- Content -->
                <div v-else-if="vendorDetails">
                    <!-- Hero Section -->
                    <div class="st-ext-relative st-ext-mb-2">
                        <!-- Banner Image -->
                        <div v-if="!blockSettings.hideVendorDetailsBanner && vendorDetails.banner && vendorDetails.banner_link" class="st-ext-relative st-ext-bg-gray-200 st-ext-border-round-2xl st-ext-overflow-hidden st-ext-mb-1"
                        style="height: var(--sp-vendor-details-banner-height); max-height: var(--sp-vendor-details-banner-height);">
                            <p-image
                                :src="vendorDetails.banner_link" 
                                alt="Vendor Banner"
                                image-class="st-ext-w-full st-ext-h-full st-ext-object-cover st-ext-border-round-2xl"
                                style="height: 100%; width: 100%; display: block;"
                                ></p-image>
                        </div>

                        <!-- Vendor Info Card -->
                        <div class="st-ext-bg-white st-ext-border-round-2xl st-ext-p-3 st-ext-md:st-ext-p-4 st-ext-shadow-lg st-ext-border">
                            <div class="st-ext-flex st-ext-gap-6 st-ext-align-items-start">
                                <!-- Vendor Logo -->
                                <div class="st-ext-flex-shrink-0">
                                    <template v-if="vendorDetails.logo_link">
                                        <p-image 
                                            :src="vendorDetails.logo_link" 
                                            :alt="vendorDetails.title || vendorDetails.brand_name"
                                            image-class="st-ext-border-round-2xl st-ext-object-cover st-ext-border-2 st-ext-border-gray-200 st-ext-h-full st-ext-w-full"
                                            :style="isMobile ? 'width: 96px; height: 96px;' : 'width: 215px; height: 215px;'"
                                            style="display: block;"
                                        ></p-image>
                                    </template>
                                    <template v-else>
                                        <div class="st-ext-border-round-2xl st-ext-bg-gray-200 st-ext-flex st-ext-align-items-center st-ext-justify-content-center st-ext-font-bold st-ext-text-2xl st-ext-text-gray-600 st-ext-border-2 st-ext-border-gray-200 st-ext-md:st-ext-hidden"
                                            style="width: 96px; height: 96px; font-size: 24px;">
                                            [[ (vendorDetails.title || vendorDetails.brand_name || '')?.charAt(0)?.toUpperCase() ]]
                                        </div>
                                        <div class="st-ext-border-round-2xl st-ext-bg-gray-200 st-ext-flex st-ext-align-items-center st-ext-justify-content-center st-ext-font-bold st-ext-text-2xl st-ext-text-gray-600 st-ext-border-2 st-ext-border-gray-200 st-ext-hidden st-ext-md:st-ext-flex"
                                            style="width: 215px; height: 215px; font-size: 24px;">
                                            [[ (vendorDetails.title || vendorDetails.brand_name || '')?.charAt(0)?.toUpperCase() ]]
                                        </div>
                                    </template>
                                </div>

                                <!-- Vendor Details -->
                                <div class="st-ext-flex-1">
                                    <h1 class="st-ext-text-3xl st-ext-font-bold st-ext-text-gray-900 st-ext-mb-1 st-ext-capitalize">
                                        [[ vendorDetails.brand_name || vendorDetails.title ]]
                                    </h1>

                                    <!-- Location -->
                                    <div v-if="showLocation && (vendorDetails.city || vendorDetails.state?.title || vendorDetails.country_detail?.name)" 
                                         class="st-ext-text-gray-500 st-ext-mb-1">
                                        [[ getLocationText() ]]
                                    </div>
                                    
                                    <div v-if="parentCompany?.display_vendor_category && vendorDetails.attributes?.category?.name" class="st-ext-text-gray-500 st-ext-mb-1">[[ terminology.vendor ]] Category: [[ vendorDetails.attributes?.category?.name ]]</div>

                                    <!-- Short Description -->
                                    <p v-if="parentCompany?.display_vendor_short_description && vendorDetails.short_description" v-html="vendorDetails.short_description" class="st-ext-text-gray-700 st-ext-leading-relaxed st-ext-text-base st-ext-m-0">
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <p-toast position="top-right"></p-toast>
                    <!-- Tabs -->
                    <div class="st-ext-w-full">
                        <p-tabview :scrollable="true" class="st-ext-custom-tabs st-ext-w-full">
                        <p-tabpanel v-if="hasTab('products')" :header="dynamicTranslations.productsTab">
                            <div class="st-ext-space-y-6">
                                <!-- Search and Sort Bar -->
                                <div class="st-ext-flex st-ext-justify-content-center st-ext-mb-6">
                                    <div class="st-ext-flex st-ext-gap-4 st-ext-align-items-center" style="width: 500px;">
                                        <!-- Search Input -->
                                        <div class="st-ext-relative st-ext-w-9">
                                            <p-input-text 
                                                v-model="productSearch" 
                                                :placeholder="dynamicTranslations.searchProductsPlaceholder" 
                                                class="st-ext-w-full st-ext-pl-10 st-ext-bg-gray-100 st-ext-border-0 st-ext-border-round-xl st-ext-text-sm"></p-input-text>
                                        </div>
                                        
                                        <!-- Sort Dropdown -->
                                        <div class="st-ext-flex st-ext-align-items-center st-ext-gap-2 vendor-details-select">
                                            <p-select 
                                                v-model="productSort" 
                                                :options="sortOptions" 
                                                optionLabel="label" 
                                                optionValue="value" 
                                                :placeholder="dynamicTranslations.sortProductsPlaceholder" 
                                                class="st-ext-w-48 st-ext-bg-gray-100 st-ext-border-0 st-ext-text-sm"></p-select>
                                        </div>
                                    </div>
                                </div>
                                    <!-- Products Grid -->
                                    <div v-if="productsLoading" class="st-ext-grid st-ext-grid-nogutter">
                                        <div v-for="n in productsPerPage" :key="n" class="st-ext-col-12 st-ext-md:st-ext-col-6 st-ext-lg:st-ext-col-3 st-ext-p-4">
                                            <div class="st-ext-bg-white st-ext-border-round-xl st-ext-overflow-hidden st-ext-shadow-sm st-ext-border st-ext-relative st-ext-h-full st-ext-flex st-ext-flex-column">
                                                <p-skeleton height="12rem" class="st-ext-mb-4"></p-skeleton>
                                                <div class="st-ext-p-4">
                                                    <p-skeleton width="100%" height="1.5rem" class="st-ext-mb-2"></p-skeleton>
                                                    <p-skeleton width="60%" height="1rem" class="st-ext-mb-4"></p-skeleton>
                                                    <p-skeleton width="100%" height="2.5rem"></p-skeleton>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div v-else-if="paginatedProducts.length > 0" class="st-ext-grid st-ext-grid-nogutter">
                                        <div v-for="product in paginatedProducts" :key="product.id" class="st-ext-col-12 st-ext-md:st-ext-col-6 st-ext-lg:st-ext-col-3 st-ext-p-4">
                                            <div class="st-ext-bg-white st-ext-overflow-hidden st-ext-shadow-sm st-ext-border st-ext-relative st-ext-h-full st-ext-flex st-ext-flex-column">
                                                
                                                <!-- Product Image -->
                                                <div class="st-ext-relative st-ext-h-48 st-ext-bg-gray-100 st-ext-flex-shrink-0">
                                                    <p-image :src="product.image" 
                                                        :alt="product.title" 
                                                        image-class="st-ext-w-full st-ext-h-full st-ext-object-contain"
                                                        style="height: 300px; display: block;"></p-image>                                               
                                                    <!-- Quick Buy Icon Button -->
                                                    <button 
                                                        @click="handleAddToCart(product)"
                                                        :disabled="cartLoading[product.id]"
                                                        class="st-ext-bg-white st-ext-flex st-ext-items-center st-ext-justify-center st-ext-border-none st-ext-cursor-pointer"
                                                        style="position: absolute; top: 16px; right: 16px; z-index: 10; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; padding: 0; overflow: hidden;"
                                                        :title="'Quick Buy'">
                                                        <i v-if="!cartLoading[product.id]" class="pi pi-shopping-bag" style="font-size: 22px; color: #1f2937;"></i>
                                                        <i v-else class="pi pi-spin pi-spinner" style="font-size: 22px; color: #1f2937;"></i>
                                                    </button>
                                                </div>
                                                
                                                <!-- Product Info -->
                                                <div class="st-ext-p-1 st-ext-flex st-ext-flex-column st-ext-flex-1">
                                                    <h3 class="st-ext-text-gray-900 st-ext-mb-1 st-ext-mt-1 st-ext-text-lg st-ext-text-capitalize">
                                                        [[ product.title ]]
                                                    </h3>
                                                    <div class="st-ext-text-gray-600 st-ext-text-lg st-ext-flex-1 st-ext-mb-1 st-ext-mt-1">
                                                        <span v-if="product.variants && product.variants.length > 0">
                                                            [[ parentCompany?.currencyCountry?.currency_symbol ]][[ product.variants[0].price ]]
                                                        </span>
                                                        <span v-if="product.variants_count > 1" class="st-ext-text-sm st-ext-text-gray-500 st-ext-ml-2">
                                                            +[[ product.variants_count - 1 ]] more
                                                        </span>
                                                    </div>
                                                    
                                                    <!-- Details Button -->
                                                    <a :href="'/products/' + product.handle" class="st-ext-block st-ext-w-full st-ext-text-center st-ext-py-1 st-ext-px-4 st-ext-border-noround st-ext-font-medium st-ext-transition-colors st-ext-mt-2 st-ext-no-underline product-details-btn">
                                                        [[ dynamicTranslations.viewProduct ]]
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- No Products Message -->
                                    <div v-else class="st-ext-text-center st-ext-py-12">
                                        <i class="pi pi-shopping-cart st-ext-text-3xl st-ext-text-gray-400 st-ext-mb-4"></i>
                                        <h3 class="st-ext-text-xl st-ext-font-medium st-ext-text-gray-900 st-ext-mb-2">[[ dynamicTranslations.noProducts ]]</h3>
                                        <p class="st-ext-text-gray-600">
                                            <span v-if="productSearch">[[ dynamicTranslations.tryAdjustingSearch ]]</span>
                                            <span v-else>[[ dynamicTranslations.vendorNoProducts ]]</span>
                                        </p>
                                    </div>

                                <!-- Pagination -->
                                <div class="st-ext-mt-6" v-if="totalProductPages > 1">
                                    <p-paginator 
                                        :rows="productsPerPage" 
                                        :totalRecords="totalProducts" 
                                        v-model:first="productsPaginationFirst" 
                                        @page="onProductPageChange" />
                                </div>
                            </div>
                        </p-tabpanel>

                            <p-tabpanel v-if="hasTab('events')" :header="$t('sellers.vendorDetails.events')">
                                <div class="st-ext-space-y-4">
                                    <h3 class="st-ext-text-xl st-ext-font-semibold">[[ $t('sellers.vendorDetails.eventsTitle') ]]</h3>
                                    <div v-if="vendorDetails?.events" v-html="vendorDetails.events" class="st-ext-prose st-ext-max-w-none st-ext-text-gray-700"></div>
                                    <p v-else class="st-ext-text-gray-600">No events information available.</p>
                                </div>
                            </p-tabpanel>

                        <p-tabpanel v-if="hasTab('reviews')" :header="$t('sellers.vendorDetails.reviews')">
                            <div class="st-ext-grid st-ext-mb-8">
                                <!-- Review Rating Section (Left Side) -->
                                <div class="st-ext-col-12 st-ext-lg:st-ext-col-4">
                                    <div class="st-ext-bg-white st-ext-rounded-lg st-ext-shadow-sm st-ext-border st-ext-border-gray-200 st-ext-p-2 st-ext-md:st-ext-p-6 st-ext-h-fit">
                                    <h3 class="st-ext-text-3xl st-ext-font-bold st-ext-text-gray-900 st-ext-mb-6">[[ $t('sellers.vendorDetails.reviews') ]]</h3>

                                    <!-- Loading State -->
                                    <div v-if="reviewsLoading" class="st-ext-text-center st-ext-py-8">
                                        <div class="st-ext-inline-block st-ext-animate-spin st-ext-rounded-full st-ext-h-12 st-ext-w-12 st-ext-border-b-2 st-ext-border-blue-600 st-ext-mb-4"></div>
                                        <div class="st-ext-text-xl st-ext-text-gray-600 st-ext-font-medium">[[ $t('sellers.vendorDetails.loadingReviews') ]]</div>
                                    </div>

                                    <!-- Reviews Data -->
                                    <div v-else>
                                        <!-- Overall Rating -->
                                        <div class="st-ext-mb-6">
                                        <div class="st-ext-text-4xl st-ext-font-bold st-ext-text-black-alpha-90 st-ext-mb-2">[[ reviewsAvg.toFixed(1) ]]</div>
                                         <div class="st-ext-text-lg st-ext-text-gray-600 st-ext-mb-4">out of 5</div>

                                        <!-- Star Rating Display -->
                                        <div class="st-ext-flex st-ext-justify-content-start st-ext-gap-1 st-ext-mb-4">
                                            <i
                                            v-for="star in 5"
                                            :key="star"
                                            :class="star <= Math.round(reviewsAvg) ? 'pi pi-star-fill st-ext-text-yellow-400' : 'pi pi-star st-ext-text-yellow-400'"
                                             class="st-ext-text-xl"></i>
                                        </div>

                                        <div class="st-ext-text-base st-ext-text-gray-500">[[ $t('sellers.vendorDetails.totalReviews') ]]: [[ reviewsCount ]]</div>
                                        </div>

                                    </div>
                                    </div>
                                </div>

                                <!-- Review Form Section (Right Side) -->
                                <div class="st-ext-col-12 st-ext-lg:st-ext-col-8">
                                    <div class="st-ext-bg-white st-ext-rounded-lg st-ext-shadow-sm st-ext-border st-ext-border-gray-200 st-ext-p-2 st-ext-md:st-ext-p-6">
                                     <h3 class="st-ext-text-xl st-ext-font-semibold st-ext-text-gray-900 st-ext-mb-6">Leave a Review</h3>

                                    <form @submit.prevent="submitReview" class="st-ext-space-y-4">
                                        <!-- Name Fields Row -->
                                        <div class="st-ext-grid st-ext-grid-cols-1 st-ext-sm:st-ext-grid-cols-2 st-ext-gap-4 st-ext-m-auto">
                                        <div>
                                            <label for="reviewFirstName" class="st-ext-block st-ext-text-sm st-ext-font-medium st-ext-text-gray-700 st-ext-mb-1">[[ $t('sellers.vendorDetails.firstName') ]] *</label>
                                            <p-input-text
                                            id="reviewFirstName"
                                            v-model="reviewForm.firstName"
                                            :placeholder="$t('sellers.vendorDetails.enterFirstName')"
                                            class="st-ext-w-full st-ext-text-sm"
                                             :class="{'st-ext-border-red-500': reviewFormErrors.firstName}"
                                             required></p-input-text>
                                            <small v-if="reviewFormErrors.firstName" class="st-ext-text-red-500 st-ext-text-sm">[[ reviewFormErrors.firstName ]]</small>
                                        </div>

                                        <div>
                                            <label for="reviewLastName" class="st-ext-block st-ext-text-sm st-ext-font-medium st-ext-text-gray-700 st-ext-mb-1">[[ $t('sellers.vendorDetails.lastName') ]] *</label>
                                            <p-input-text
                                            id="reviewLastName"
                                            v-model="reviewForm.lastName"
                                            :placeholder="$t('sellers.vendorDetails.enterLastName')"
                                            class="st-ext-w-full st-ext-text-sm"
                                             :class="{'st-ext-border-red-500': reviewFormErrors.lastName}"
                                             required></p-input-text>
                                            <small v-if="reviewFormErrors.lastName" class="st-ext-text-red-500 st-ext-text-sm">[[ reviewFormErrors.lastName ]]</small>
                                        </div>
                                        </div>

                                        <!-- Email Field -->
                                        <div>
                                        <label for="reviewEmail" class="st-ext-block st-ext-text-sm st-ext-font-medium st-ext-text-gray-700 st-ext-mb-1">[[ $t('sellers.vendorDetails.email') ]] *</label>
                                        <p-input-text
                                            id="reviewEmail"
                                            v-model="reviewForm.email"
                                            type="email"
                                            :placeholder="$t('sellers.vendorDetails.enterEmailAddress')"
                                            class="st-ext-w-full st-ext-text-sm"
                                             :class="{'st-ext-border-red-500': reviewFormErrors.email}"
                                             required></p-input-text>
                                        <small v-if="reviewFormErrors.email" class="st-ext-text-red-500 st-ext-text-sm">[[ reviewFormErrors.email ]]</small>
                                        </div>

                                        <!-- Review Title -->
                                        <div>
                                        <label for="reviewTitle" class="st-ext-block st-ext-text-sm st-ext-font-medium st-ext-text-gray-700 st-ext-mb-1">[[ $t('sellers.vendorDetails.reviewTitle') ]]</label>
                                        <p-input-text
                                            id="reviewTitle"
                                            v-model="reviewForm.title"
                                            :placeholder="$t('sellers.vendorDetails.reviewTitlePlaceholder')"
                                            class="st-ext-w-full st-ext-text-sm"
                                             :class="{'st-ext-border-red-500': reviewFormErrors.title}"
                                             required></p-input-text>
                                        <small v-if="reviewFormErrors.title" class="st-ext-text-red-500 st-ext-text-sm">[[ reviewFormErrors.title ]]</small>
                                        </div>

                                        <!-- Star Rating -->
                                        <div>
                                        <label class="st-ext-block st-ext-text-sm st-ext-font-medium st-ext-text-gray-700 st-ext-mb-1">[[ $t('sellers.vendorDetails.rating') ]]</label>
                                        <div class="st-ext-flex st-ext-gap-2">

                                            <button
                                            v-for="star in 5"
                                            :key="star"
                                            type="button"
                                            @click="reviewForm.rating = star"
                                            class="st-ext-text-xl st-ext-transition-colors hover:st-ext-scale-110"
                                             :class="star <= reviewForm.rating ? 'st-ext-text-yellow-400' : 'st-ext-text-gray-300'">
                                            <i :class="star <= reviewForm.rating ? 'pi pi-star-fill' : 'pi pi-star'"></i>
                                            </button>
                                        </div>
                                        <small v-if="reviewFormErrors.rating" class="st-ext-text-red-500 st-ext-text-sm">[[ reviewFormErrors.rating ]]</small>
                                        </div>

                                        <!-- Review Description -->
                                        <div>
                                        <label for="reviewDescription" class="st-ext-block st-ext-text-sm st-ext-font-medium st-ext-text-gray-700 st-ext-mb-1">Review Description *</label>
                                        <p-textarea
                                            id="reviewDescription"
                                            v-model="reviewForm.description"
                                            placeholder="Share your experience with this vendor..."
                                            rows="4"
                                            class="st-ext-w-full st-ext-text-sm"
                                             :class="{'st-ext-border-red-500': reviewFormErrors.description}"
                                             required></p-textarea>
                                        <small v-if="reviewFormErrors.description" class="st-ext-text-red-500 st-ext-text-sm">[[ reviewFormErrors.description ]]</small>
                                        </div>

                                        <!-- Submit Button -->
                                        <div class="st-ext-flex st-ext-justify-end">
                                        <p-button
                                            type="submit"
                                            :label="$t('sellers.vendorDetails.submitReview')"
                                            icon="pi pi-send"
                                            :loading="reviewFormSubmitting"
                                            class="st-ext-text-sm"></p-button>
                                        </div>
                                    </form>

                                    <!-- Success/Error Messages -->
                                    <div v-if="reviewFormSuccess" class="st-ext-mt-4 st-ext-p-4 st-ext-bg-green-50 st-ext-border st-ext-border-green-200 st-ext-rounded-lg">
                                        <div class="st-ext-flex st-ext-align-items-center st-ext-gap-2">
                                        <i class="pi pi-check-circle st-ext-text-green-600"></i>
                                        <p class="st-ext-text-green-800 st-ext-font-medium st-ext-text-sm">Review submitted successfully! Thank you for your feedback.</p>
                                        </div>
                                    </div>

                                    <div v-if="reviewFormError" class="st-ext-mt-4 st-ext-p-4 st-ext-bg-red-50 st-ext-border st-ext-border-red-200 st-ext-rounded-lg">
                                        <div class="st-ext-flex st-ext-align-items-center st-ext-gap-2">
                                        <i class="pi pi-exclamation-triangle st-ext-text-red-600"></i>
                                        <p class="st-ext-text-red-800 st-ext-font-medium st-ext-text-sm">[[ reviewFormError ]]</p>
                                        </div>
                                    </div>
                                    </div>
                                </div>
                                </div>

                                <!-- Past Reviews Section -->
                                <div class="st-ext-bg-white st-ext-rounded-lg st-ext-shadow-sm st-ext-border st-ext-border-gray-200 st-ext-p-4 st-ext-md:st-ext-p-6">
                                 <h3 class="st-ext-text-xl st-ext-font-bold st-ext-text-gray-900 st-ext-mb-6">[[ $t('sellers.vendorDetails.recentReviews') ]]</h3>

                                 <!-- Loading State -->
                                 <div v-if="reviewsLoading" class="st-ext-text-center st-ext-py-12">
                                     <div class="st-ext-inline-block st-ext-animate-spin st-ext-rounded-full st-ext-h-8 st-ext-w-8 st-ext-border-b-2 st-ext-border-blue-600 st-ext-mb-4"></div>
                                     <div class="st-ext-text-base st-ext-text-gray-600 st-ext-font-medium">[[ $t('sellers.vendorDetails.loadingReviews') ]]</div>
                                 </div>

                                <!-- Reviews List -->
                                <div v-else-if="reviews && reviews.length > 0" class="st-ext-space-y-6">
                                    <div
                                    v-for="review in reviews"
                                    :key="review.id"
                                    class="st-ext-border-bottom-1 st-ext-border-gray-200 st-ext-rounded-lg st-ext-p-6 st-ext-bg-gray-50 st-ext-shadow-sm">
                                    <div class="st-ext-flex st-ext-flex-column st-ext-justify-start st-ext-align-items-start st-ext-mb-3">
                                        <h4 class="st-ext-text-lg st-ext-font-semibold st-ext-text-gray-900">[[ review.title ]]</h4>
                                        <div class="st-ext-flex st-ext-gap-1">
                                        <i
                                            v-for="star in review.ratings"
                                            :key="star"
                                            class="pi pi-star-fill st-ext-text-yellow-400 st-ext-text-sm"></i>
                                        <i
                                            v-for="star in 5-review.ratings"
                                            :key="star"
                                            class="pi pi-star st-ext-text-yellow-400 st-ext-text-sm"></i>
                                        </div>
                                    </div>
                                    <p class="st-ext-text-sm st-ext-text-gray-700 st-ext-mb-3 st-ext-leading-relaxed">
                                        [[ review.description ]]
                                    </p>
                                    <div class="st-ext-flex st-ext-flex-column st-ext-justify-between st-ext-align-items-start">
                                        <span class="st-ext-text-sm st-ext-font-medium st-ext-text-gray-600 st-ext-block">- [[ review.given_by ]]</span>
                                        <br/>
                                        <span class="st-ext-text-xs st-ext-text-gray-500">[[ new Date(review.created_at).toLocaleDateString() ]]</span>
                                    </div>
                                    </div>
                                </div>

                                <!-- No Reviews Message -->
                                <div v-else class="st-ext-text-center st-ext-py-12">
                                    <div class="st-ext-text-gray-400 st-ext-mb-4">
                                    <i class="pi pi-star st-ext-text-4xl"></i>
                                    </div>
                                    <h3 class="st-ext-text-lg st-ext-font-medium st-ext-text-gray-500 st-ext-mb-2">[[ $t('sellers.vendorDetails.noReviewsYet') ]]</h3>
                                    <p class="st-ext-text-base st-ext-text-gray-400">[[ $t('sellers.vendorDetails.beFirstToReview') ]]</p>
                                </div>
                                </div>


                        </p-tabpanel>

                            <p-tabpanel v-if="hasTab('contact')" :header="$t('sellers.vendorDetails.contact')">
                                <div class="st-ext-space-y-6">
                                    <div class="st-ext-grid st-ext-grid-nogutter">
                                        <!-- Contact Information (Left) -->
                                        <div class="st-ext-col-12 st-ext-md:st-ext-col-6">
                                            <div class="st-ext-bg-white st-ext-border st-ext-border-round-lg st-ext-p-3 st-ext-md:st-ext-p-4">
                                                <h4 class="st-ext-text-lg st-ext-font-semibold st-ext-mb-4">Contact Information</h4>
                                                
                                                <!-- Email -->
                                                <div v-if="vendorDetails?.email" class="st-ext-flex st-ext-align-items-center st-ext-gap-3 st-ext-mb-3">
                                                    <i class="pi pi-envelope st-ext-text-gray-500"></i>
                                                    <div>
                                                        <span class="st-ext-font-medium">Email:</span>
                                                        <a :href="'mailto:' + vendorDetails.email" class="st-ext-text-blue-600 st-ext-ml-2">
                                                            [[ vendorDetails.email ]]
                                                        </a>
                                                    </div>
                                                </div>
                                                
                                                <!-- Phone -->
                                                <div v-if="vendorDetails?.phone_number" class="st-ext-flex st-ext-align-items-center st-ext-gap-3 st-ext-mb-3">
                                                    <i class="pi pi-phone st-ext-text-gray-500"></i>
                                                    <div>
                                                        <span class="st-ext-font-medium">Phone:</span>
                                                        <a :href="'tel:' + vendorDetails.phone_number" class="st-ext-text-blue-600 st-ext-ml-2">
                                                            [[ vendorDetails.phone_number ]]
                                                        </a>
                                                    </div>
                                                </div>
                                                
                                                <!-- Address -->
                                                <div v-if="showLocation && (vendorDetails?.city || vendorDetails?.state?.title || vendorDetails?.country_details?.name)" 
                                                     class="st-ext-flex st-ext-align-items-start st-ext-gap-3 st-ext-mb-3">
                                                    <i class="pi pi-map-marker st-ext-text-gray-500 st-ext-mt-1"></i>
                                                    <div>
                                                        <span class="st-ext-font-medium">Address:</span>
                                                        <span class="st-ext-ml-2 st-ext-text-gray-700">
                                                            [[ getLocationText() ]]
                                                        </span>
                                                    </div>
                                                </div>

                                                <!-- Social Media Links -->
                                                <div class="st-ext-mt-4">
                                                    <h4 class="st-ext-text-base st-ext-font-semibold st-ext-mb-3">Follow Us</h4>
                                                    <div class="st-ext-space-y-3">
                                                        <div v-if="vendorDetails?.facebook_link" class="st-ext-flex st-ext-align-items-center st-ext-gap-3">
                                                            <i class="pi pi-facebook st-ext-text-blue-600"></i>
                                                            <a :href="vendorDetails.facebook_link" target="_blank" class="st-ext-text-blue-600 hover:st-ext-underline">Facebook</a>
                                                        </div>
                                                        <div v-if="vendorDetails?.instagram_link" class="st-ext-flex st-ext-align-items-center st-ext-gap-3">
                                                            <i class="pi pi-instagram st-ext-text-pink-600"></i>
                                                            <a :href="vendorDetails.instagram_link" target="_blank" class="st-ext-text-pink-600 hover:st-ext-underline">Instagram</a>
                                                        </div>
                                                        <div v-if="vendorDetails?.twitter_link" class="st-ext-flex st-ext-align-items-center st-ext-gap-3">
                                                            <i class="pi pi-twitter st-ext-text-blue-400"></i>
                                                            <a :href="vendorDetails.twitter_link" target="_blank" class="st-ext-text-blue-400 hover:st-ext-underline">Twitter</a>
                                                        </div>
                                                        <div v-if="vendorDetails?.tiktok_link" class="st-ext-flex st-ext-align-items-center st-ext-gap-3">
                                                            <i class="pi pi-video st-ext-text-gray-800"></i>
                                                            <a :href="vendorDetails.tiktok_link" target="_blank" class="st-ext-text-gray-800 hover:st-ext-underline">TikTok</a>
                                                        </div>
                                                        <div v-if="!vendorDetails?.facebook_link && !vendorDetails?.instagram_link && !vendorDetails?.twitter_link && !vendorDetails?.tiktok_link" class="st-ext-text-gray-600">
                                                            No social media links available.
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Contact Form (Right) -->
                                        <div class="st-ext-col-12 st-ext-md:st-ext-col-6">
                                            <div class="st-ext-bg-white st-ext-border st-ext-border-round-lg st-ext-p-3 st-ext-md:st-ext-p-4">
                                                <h3 class="st-ext-text-xl st-ext-font-semibold st-ext-text-gray-900 st-ext-mb-4">Send us a Message</h3>

                                                <form @submit.prevent="submitContactForm" class="st-ext-space-y-4">
                                                    <!-- Name and Email Row -->
                                                    <div class="st-ext-grid st-ext-grid-cols-1 st-ext-sm:st-ext-grid-cols-2 st-ext-gap-4 st-ext-m-auto">
                                                        <div>
                                                            <label for="contactName" class="st-ext-block st-ext-text-sm st-ext-font-medium st-ext-text-gray-700">[[ $t('sellers.vendorDetails.fullName') ]] *</label>
                                                            <p-input-text
                                                                id="contactName"
                                                                v-model="contactForm.name"
                                                                :placeholder="$t('sellers.vendorDetails.enterFullName')"
                                                                class="st-ext-w-full st-ext-text-sm"
                                                                :class="{'st-ext-border-red-500': contactFormErrors.name}"
                                                                required></p-input-text>
                                                            <small v-if="contactFormErrors.name" class="st-ext-text-red-500 st-ext-text-sm">[[ contactFormErrors.name ]]</small>
                                                        </div>

                                                        <div>
                                                            <label for="contactEmail" class="st-ext-block st-ext-text-sm st-ext-font-medium st-ext-text-gray-700">[[ $t('sellers.vendorDetails.email') ]] *</label>
                                                            <p-input-text
                                                                id="contactEmail"
                                                                v-model="contactForm.email"
                                                                type="email"
                                                                :placeholder="$t('sellers.vendorDetails.enterEmail')"
                                                                class="st-ext-w-full st-ext-text-sm"
                                                                :class="{'st-ext-border-red-500': contactFormErrors.email}"
                                                                required></p-input-text>
                                                            <small v-if="contactFormErrors.email" class="st-ext-text-red-500 st-ext-text-sm">[[ contactFormErrors.email ]]</small>
                                                        </div>
                                                    </div>
                                                    <!-- Message -->
                                                    <div>
                                                        <label for="contactMessage" class="st-ext-block st-ext-text-sm st-ext-font-medium st-ext-text-gray-700">Message *</label>
                                                        <p-textarea
                                                            id="contactMessage"
                                                            v-model="contactForm.message"
                                                            placeholder="Tell us more about your inquiry..."
                                                            rows="5"
                                                            class="st-ext-w-full st-ext-text-sm"
                                                            :class="{'st-ext-border-red-500': contactFormErrors.message}"
                                                            required></p-textarea>
                                                        <small v-if="contactFormErrors.message" class="st-ext-text-red-500 st-ext-text-sm">[[ contactFormErrors.message ]]</small>
                                                    </div>

                                                    <!-- Submit Button -->
                                                    <div class="st-ext-flex st-ext-justify-end">
                                                        <p-button
                                                            type="submit"
                                                            :label="$t('sellers.vendorDetails.sendMessage')"
                                                            icon="pi pi-send"
                                                            :loading="contactFormSubmitting"
                                                            class="st-ext-text-sm"></p-button>
                                                    </div>
                                                </form>

                                                <!-- Success/Error Messages -->
                                                <div v-if="contactFormSuccess" class="st-ext-mt-4 st-ext-p-4 st-ext-bg-green-50 st-ext-border st-ext-border-green-200 st-ext-rounded-lg">
                                                    <div class="st-ext-flex st-ext-align-items-center st-ext-gap-2">
                                                        <i class="pi pi-check-circle st-ext-text-green-600"></i>
                                                        <small class="st-ext-text-green-800 st-ext-font-medium">Message sent successfully! We'll get back to you soon.</small>
                                                    </div>
                                                </div>

                                                <div v-if="contactFormError" class="st-ext-mt-4 st-ext-p-4 st-ext-bg-red-50 st-ext-border st-ext-border-red-200 st-ext-rounded-lg">
                                                    <div class="st-ext-flex st-ext-align-items-center st-ext-gap-2">
                                                        <i class="pi pi-exclamation-triangle st-ext-text-red-600"></i>
                                                        <p class="st-ext-text-red-800 st-ext-font-medium st-ext-text-2xl">[[ contactFormError ]]</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </p-tabpanel>

                            <p-tabpanel v-if="hasTab('about')" :header="$t('sellers.vendorDetails.about')">
                                <div class="st-ext-space-y-4">
                                    <h3 class="st-ext-text-xl st-ext-font-semibold">[[ $t('sellers.vendorDetails.about') ]]</h3>
                                    <div class="st-ext-prose st-ext-max-w-none">
                                        <div v-if="vendorDetails?.about_us" v-html="vendorDetails.about_us" class="st-ext-text-gray-700"></div>
                                        <p v-else class="st-ext-text-gray-600">[[ $t('sellers.vendorDetails.noDescription') ]]</p>
                                    </div>
                                </div>
                            </p-tabpanel>

                            <p-tabpanel v-if="hasTab('policy')" :header="$t('sellers.vendorDetails.policy')">
                                <div class="st-ext-space-y-4">
                                    <h3 class="st-ext-text-xl st-ext-font-semibold">[[ $t('sellers.vendorDetails.policyTitle') ]]</h3>
                                    <div v-if="vendorDetails?.policy" v-html="vendorDetails.policy" class="st-ext-prose st-ext-max-w-none st-ext-text-gray-700"></div>
                                    <p v-else class="st-ext-text-gray-600">No policy information available.</p>
                                </div>
                            </p-tabpanel>
                        </p-tabview>
                    </div>
                </div>

                <!-- Error State -->
                <div v-else class="st-ext-text-center st-ext-py-12">
                    <i class="pi pi-exclamation-triangle st-ext-text-3xl st-ext-text-gray-400 st-ext-mb-4"></i>
                    <h3 class="st-ext-text-xl st-ext-font-medium st-ext-text-gray-900 st-ext-mb-2">Vendor not found</h3>
                    <p class="st-ext-text-gray-600">The vendor you're looking for doesn't exist or has been removed.</p>
                </div>
            </div>
        `,
        setup(props) {
            const isMobile = ref(window.innerWidth < 640)
            const { t, locale } = VueI18n.useI18n()
            const toast = useToast()

            const route = VueRouter.useRoute()
            const blockSettings = loadBlockSettings()
            const terminology = computed(() => props.terminology || getTerminology(blockSettings))
            
            // Dynamic translations with terminology 
            const dynamicTranslations = computed(() => ({
                productsTab: terminology.value.products,
                searchProductsPlaceholder: `Search ${terminology.value.products.toLowerCase()}`,
                sortProductsPlaceholder: `Sort ${terminology.value.products.toLowerCase()}`,
                viewProduct: `View ${terminology.value.product}`,
                noProducts: `No ${terminology.value.products.toLowerCase()}`,
                tryAdjustingSearch: `Try adjusting your search terms.`,
                vendorNoProducts: `This ${terminology.value.vendor.toLowerCase()} doesn't have any ${terminology.value.products.toLowerCase()} yet.`,
            }))
            
            const handle = computed(() => route.params.handle)
            
            const loading = ref(true)
            const vendorDetails = ref(null)
            const parentCompany = ref(null)
            const shopId = ref(null)
            
            // Product tab state
            const productSearch = ref('')
            const productSort = ref('')
            const productsPerPage = ref(blockSettings.productsPerPage)
            const currentProductPage = ref(0)
            const productsPaginationFirst = ref(0)
            const totalProducts = ref(0)
            const products = ref([])
            const productsLoading = ref(false)
            let searchDebounceTimer = null
            
            // Reviews state
            const reviews = ref([])
            const reviewsLoading = ref(false)
            const reviewsAvg = ref(0)
            const reviewsCount = ref(0)
            
            // Contact form state
            const contactForm = ref({
                name: '',
                email: '',
                message: ''
            })
            const contactFormErrors = ref({})
            const contactFormSubmitting = ref(false)
            const contactFormSuccess = ref(false)
            const contactFormError = ref('')
            const cartLoading = ref({})

            const handleAddToCart = async (product) => {
                if (!product) return

                if (product.variants_count > 1) {
                    window.location.href = `/products/${product.handle}`
                    return
                }

                const variantId = product.variants[0].channel_id
                cartLoading.value[product.id] = true

                try {
                    const formData = new FormData();
                    formData.append('quantity', 1);
                    formData.append('id', variantId);
                    const response = await fetch('/cart/add.js', {
                        method: 'POST',
                        body: formData
                    })
                    if(response.ok){
                        toast.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: t('sellers.vendorDetails.productAddedToCart') || 'Product added to cart successfully',
                            life: 3000
                        });
                    }
                } catch (error) {
                    console.error('Error adding to cart:', error)
                } finally {
                    cartLoading.value[product.id] = false
                }
            }

            // Review form state
            const reviewForm = ref({
                firstName: '',
                lastName: '',
                email: '',
                title: '',
                rating: 0,
                description: ''
            })
            const reviewFormErrors = ref({})
            const reviewFormSubmitting = ref(false)
            const reviewFormSuccess = ref(false)
            const reviewFormError = ref('')

            const urlParams = new URLSearchParams(window.location.search)
            const shop = Shopify.shop

            const showLocation = computed(() => !!parentCompany.value?.display_vendor_location)

            const sortOptions = computed(() => [
                { label: t('sellers.vendorDetails.sortOptions.bestSelling'), value: 'best-selling' },
                { label: t('sellers.vendorDetails.sortOptions.nameAscending'), value: 'title-ascending' },
                { label: t('sellers.vendorDetails.sortOptions.nameDescending'), value: 'title-descending' },
                { label: t('sellers.vendorDetails.sortOptions.priceAscending'), value: 'price-ascending' },
                { label: t('sellers.vendorDetails.sortOptions.priceDescending'), value: 'price-descending' },
                { label: t('sellers.vendorDetails.sortOptions.newestFirst'), value: 'date-descending' },
                { label: t('sellers.vendorDetails.sortOptions.oldestFirst'), value: 'date-ascending' }
            ])

            // Computed properties for pagination
            const totalProductPages = computed(() => Math.ceil(totalProducts.value / productsPerPage.value))
            
            const paginatedProducts = computed(() => {
                return products.value
            })

            const hasTab = (tabKey) => {
                if (!parentCompany.value?.vendor_profile_settings) return false
                const settings = parentCompany.value.vendor_profile_settings
                
                switch (tabKey) {
                    case 'products': return !!settings.seller_products_tab
                    case 'about': return !!settings.seller_about_us_tab
                    case 'reviews': return !!settings.seller_reviews_tab
                    case 'events': return !!settings.seller_events_tab
                    case 'contact': return !!settings.seller_contact_us_tab
                    case 'policy': return !!settings.seller_policy_tab
                    default: return false
                }
            }

            const getLocationText = () => {
                const parts = []
                if (vendorDetails.value?.city) parts.push(vendorDetails.value.city)
                else if (vendorDetails.value?.state?.title) parts.push(vendorDetails.value.state.title)
                
                if (vendorDetails.value?.country_detail?.name) parts.push(vendorDetails.value.country_detail.name)
                
                return parts.join(', ')
            }

            const onProductPageChange = (event) => {
                currentProductPage.value = Math.floor(event.first / productsPerPage.value)
                productsPaginationFirst.value = event.first
                fetchProducts()
            }

            const fetchVendorDetails = async () => {
                loading.value = true
                try {
                    const url = `/a/dashboard/vendor-details/${encodeURIComponent(handle.value)}?shop=${encodeURIComponent(shop)}`
                    const response = await fetch(url)
                    const data = await response.json()
                    
                    if (data.success) {
                        vendorDetails.value = data.data.vendor_details
                        parentCompany.value = data.data.parent_company
                        shopId.value = data.data.shop_id
                        
                        // Set default product sorting from parentCompany or use first option
                        if (!productSort.value) {
                            const defaultSort = parentCompany.value?.default_product_sorting_method
                            if (defaultSort) {
                                productSort.value = defaultSort
                            } else {
                                // Use first sort option as default
                                productSort.value = 'best-selling'
                            }
                        }
                        
                        // Fetch reviews after getting vendor details
                        // Note: fetchProducts() will be called automatically by the productSort watcher
                        fetchReviews()
                    } else {
                        console.error('Failed to fetch vendor details:', data.message)
                        vendorDetails.value = null
                    }
                } catch (error) {
                    console.error('Error fetching vendor details:', error)
                    vendorDetails.value = null
                } finally {
                    loading.value = false
                }
            }

            const fetchProducts = async () => {
                if (!handle.value) return
                
                productsLoading.value = true
                try {
                    const params = new URLSearchParams({
                        shop: shop,
                        page: (currentProductPage.value + 1).toString(),
                        limit: productsPerPage.value.toString()
                    })
                    
                    if (productSearch.value.trim()) {
                        params.append('search_product', productSearch.value.trim())
                    }
                    params.append('sort_by', productSort.value)
                    
                    const url = `/a/dashboard/vendor-products/${encodeURIComponent(handle.value)}?${params.toString()}`
                    const response = await fetch(url)
                    const data = await response.json()
                    
                    if (data.success) {
                        products.value = data.data.products || []
                        totalProducts.value = data.data.count || 0
                    } else {
                        console.error('Failed to fetch products:', data.message)
                        products.value = []
                        totalProducts.value = 0
                    }
                } catch (error) {
                    console.error('Error fetching products:', error)
                    products.value = []
                    totalProducts.value = 0
                } finally {
                    productsLoading.value = false
                }
            }

            const fetchReviews = async () => {
                if (!vendorDetails.value?.id) return
                
                reviewsLoading.value = true
                try {
                    const url = `/a/dashboard/vendor-reviews/${encodeURIComponent(vendorDetails.value.slug)}?shop=${encodeURIComponent(shop)}`
                    const response = await fetch(url)
                    const data = await response.json()
                    
                    if (data.success) {
                        reviews.value = data.data.reviews || []
                        reviewsAvg.value = Number(data.data.reviews_avg) || 0
                        reviewsCount.value = data.data.reviews_count || 0
                    } else {
                        console.error('Failed to fetch reviews:', data.message)
                        reviews.value = []
                        reviewsAvg.value = 0
                        reviewsCount.value = 0
                    }
                } catch (error) {
                    console.error('Error fetching reviews:', error)
                    reviews.value = []
                    reviewsAvg.value = 0
                    reviewsCount.value = 0
                } finally {
                    reviewsLoading.value = false
                }
            }

            const validateReviewForm = () => {
                reviewFormErrors.value = {}
                
                if (!reviewForm.value.firstName.trim()) {
                    reviewFormErrors.value.firstName = t('sellers.vendorDetails.validation.firstNameRequired')
                }
                
                if (!reviewForm.value.lastName.trim()) {
                    reviewFormErrors.value.lastName = t('sellers.vendorDetails.validation.lastNameRequired')
                }
                
                if (!reviewForm.value.email.trim()) {
                    reviewFormErrors.value.email = t('sellers.vendorDetails.validation.emailRequired')
                } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reviewForm.value.email)) {
                    reviewFormErrors.value.email = t('sellers.vendorDetails.validation.emailInvalid')
                }
                
                if (!reviewForm.value.title.trim()) {
                    reviewFormErrors.value.title = t('sellers.vendorDetails.validation.reviewTitleRequired')
                }
                
                if (reviewForm.value.rating === 0) {
                    reviewFormErrors.value.rating = t('sellers.vendorDetails.validation.ratingRequired')
                }
                
                if (!reviewForm.value.description.trim()) {
                    reviewFormErrors.value.description = t('sellers.vendorDetails.validation.reviewDescriptionRequired')
                }
                
                return Object.keys(reviewFormErrors.value).length === 0
            }

            const submitReview = async () => {
                if (!validateReviewForm()) {
                    return
                }
                
                reviewFormSubmitting.value = true
                reviewFormSuccess.value = false
                reviewFormError.value = ''
                
                try {
                    const payload = {
                        company_id: vendorDetails.value?.id,
                        shop: shop,
                        name: reviewForm.value.firstName.trim() + ' ' + reviewForm.value.lastName.trim(),
                        email: reviewForm.value.email.trim(),
                        title: reviewForm.value.title.trim(),
                        ratings: reviewForm.value.rating,
                        description: reviewForm.value.description.trim()
                    }
                    
                    const response = await fetch(`${API_BASE_URL}/api/v2/post-vendor-reviews`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(payload)
                    })
                    
                    if (response.ok) {
                        reviewFormSuccess.value = true
                        // Reset form
                        reviewForm.value = {
                            firstName: '',
                            lastName: '',
                            email: '',
                            title: '',
                            rating: 0,
                            description: ''
                        }
                        // Refresh reviews
                        await fetchReviews()
                    } else {
                        const errorData = await response.json()
                        reviewFormError.value = errorData.message || 'Failed to submit review. Please try again.'
                    }
                } catch (error) {
                    console.error('Error submitting review:', error)
                    reviewFormError.value = 'Failed to submit review. Please try again.'
                } finally {
                    reviewFormSubmitting.value = false
                }
            }

            const validateContactForm = () => {
                contactFormErrors.value = {}
                if (!contactForm.value.name.trim()) {
                    contactFormErrors.value.name = t('sellers.vendorDetails.validation.fullNameRequired')
                }
                if (!contactForm.value.email.trim()) {
                    contactFormErrors.value.email = t('sellers.vendorDetails.validation.emailRequired')
                } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactForm.value.email)) {
                    contactFormErrors.value.email = t('sellers.vendorDetails.validation.emailInvalid')
                }
                if (!contactForm.value.message.trim()) {
                    contactFormErrors.value.message = t('sellers.vendorDetails.validation.messageRequired')
                }
                return Object.keys(contactFormErrors.value).length === 0
            }

            const submitContactForm = async () => {
                if (!validateContactForm()) return
                contactFormSubmitting.value = true
                contactFormSuccess.value = false
                contactFormError.value = ''
                try {
                    const payload = {
                        shop_id: shopId.value,
                        company_id: vendorDetails.value?.id,
                        shop: shop,
                        name: contactForm.value.name.trim(),
                        email: contactForm.value.email.trim(),
                        message: contactForm.value.message.trim()
                    }
                    
                    const response = await fetch(`${API_BASE_URL}/api/v1/vendor/contact`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(payload)
                    })
                    
                    if (response.ok) {
                        contactFormSuccess.value = true
                        contactForm.value = { name: '', email: '', message: '' }
                    } else {
                        const errorData = await response.json()
                        contactFormError.value = errorData.message || 'Failed to send message. Please try again.'
                    }
                } catch (e) {
                    console.error('Error submitting contact form:', e)
                    contactFormError.value = 'Failed to send message. Please try again.'
                } finally {
                    contactFormSubmitting.value = false
                }
            }

            // Debounced search function
            const debouncedSearch = () => {
                if (searchDebounceTimer) {
                    clearTimeout(searchDebounceTimer)
                }
                searchDebounceTimer = setTimeout(() => {
                    currentProductPage.value = 0
                    productsPaginationFirst.value = 0
                    fetchProducts()
                }, 300) // 300ms delay
            }

            // Watch for search changes with debouncing
            watch(productSearch, () => {
                debouncedSearch()
            })

            // Watch for sort changes (immediate)
            watch(productSort, () => {
                currentProductPage.value = 0
                productsPaginationFirst.value = 0
                fetchProducts()
            })

            onMounted(() => {
                fetchVendorDetails()
            })

            return {
                isMobile,
                handle,
                loading,
                vendorDetails,
                parentCompany,
                showLocation,
                hasTab,
                getLocationText,
                productSearch,
                productSort,
                sortOptions,
                paginatedProducts,
                totalProducts,
                totalProductPages,
                productsPerPage,
                currentProductPage,
                productsPaginationFirst,
                onProductPageChange,
                products,
                productsLoading,
                fetchProducts,
                reviews,
                reviewsLoading,
                reviewsAvg,
                reviewsCount,
                reviewForm,
                reviewFormErrors,
                reviewFormSubmitting,
                reviewFormSuccess,
                reviewFormError,
                submitReview,
                fetchReviews,
                contactForm,
                contactFormErrors,
                contactFormSubmitting,
                contactFormSuccess,
                contactFormError,
                submitContactForm,
                handleAddToCart,
                cartLoading,
                terminology,
                dynamicTranslations,
                blockSettings
            }
        }
    }

    // Router setup
    const routes = [
        { path: '/', name: 'vendor-list', component: VendorList },
        { path: '/:handle', name: 'vendor-details', component: VendorDetails }
    ]
    const router = createRouter({
        history: createWebHashHistory(),
        routes
    })

    // Root App
    const App = {
        template: `
            <div class="st-ext-p-1 st-ext-md:st-ext-px-4" id="st-ext-seller-profile-container">
                <router-view :terminology="terminology" />
            </div>
        `,
        setup() {
            const blockSettings = loadBlockSettings()
            const terminology = getTerminology(blockSettings)
            
            return {
                terminology
            }
        }
    }

    // Initialize app with i18n support
    const initializeApp = async () => {
        const { messages, locale } = await loadLocaleMessages()
        
        const i18n = createI18n({
            legacy: false,
            locale: locale,
            fallbackLocale: 'en',
            messages
        })

        const app = createApp(App)

        // PrimeVue registration
        app.use(PrimeVue)
        app.use(i18n)

        const Noir = PrimeVue.definePreset(PrimeVue.Themes.Aura, {
            semantic: {
                primary: {
                50: '{zinc.50}',
                100: '{zinc.100}',
                200: '{zinc.200}',
                300: '{zinc.300}',
                400: '{zinc.400}',
                500: '{zinc.500}',
                600: '{zinc.600}',
                700: '{zinc.700}',
                800: '{zinc.800}',
                900: '{zinc.900}',
                950: '{zinc.950}'
                },
                colorScheme: {
                light: {
                    primary: {
                    color: '{zinc.950}',
                    inverseColor: '#ffffff',
                    hoverColor: '{zinc.900}',
                    activeColor: '{zinc.800}'
                    },
                    highlight: {
                    background: '{zinc.950}',
                    focusBackground: '{zinc.700}',
                    color: '#ffffff',
                    focusColor: '#ffffff'
                    }
                },
                dark: {
                    primary: {
                    color: '{zinc.50}',
                    inverseColor: '{zinc.950}',
                    hoverColor: '{zinc.100}',
                    activeColor: '{zinc.200}'
                    },
                    highlight: {
                    background: 'rgba(250, 250, 250, .16)',
                    focusBackground: 'rgba(250, 250, 250, .24)',
                    color: 'rgba(255,255,255,.87)',
                    focusColor: 'rgba(255,255,255,.87)'
                    }
                }
                }
            }
        });
      
        app.use(PrimeVue.Config, {
            theme: {
                preset: Noir,
                options: {
                darkModeSelector: false
                }
            }
        });

        app.use(PrimeVue.ToastService);
        app.component('p-card', PrimeVue.Card)
        app.component('p-button', PrimeVue.Button)
        app.component('p-paginator', PrimeVue.Paginator)
        app.component('p-skeleton', PrimeVue.Skeleton)
        app.component('p-input-text', PrimeVue.InputText);
        app.component('p-dropdown', PrimeVue.Dropdown);
        app.component('p-toast', PrimeVue.Toast);
        app.component('p-image', PrimeVue.Image);
        app.component('p-select', PrimeVue.Select);
        app.component('p-tabview', PrimeVue.TabView);
        app.component('p-tabpanel', PrimeVue.TabPanel);
        app.component('p-textarea', PrimeVue.Textarea);
        app.config.compilerOptions.delimiters = ['[[', ']]'];
        app.use(router)
        app.mount('#seller-profile-app')
    }

    // Initialize the app
    initializeApp()
})()
