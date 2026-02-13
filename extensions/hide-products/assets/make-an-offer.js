async function MakeAnOfferCode(){
    const { createApp, ref, onBeforeMount, computed, onUnmounted } = Vue;
    const { createI18n } = VueI18n
    const { useToast } = PrimeVue;
    
    // Locale detection from Shopify theme
    const getShopifyLocale = () => {
        // Try to get locale from Shopify Liquid or fall back to browser language
        const shopifyLocale = document.documentElement.lang || 
                             document.querySelector('html')?.getAttribute('lang') ||
                             window.Shopify?.locale ||
                             navigator.language.split('-')[0]
        
        // Map Shopify locales to our supported locales
        const supportedLocales = ['en', 'de', 'es', "nl", "pt"]
        const normalizedLocale = shopifyLocale.toLowerCase().split('-')[0]
        
        return supportedLocales.includes(normalizedLocale) ? normalizedLocale : 'en'
    }
    
    // Load locale messages
    const loadLocaleMessages = async () => {
        const locale = getShopifyLocale()
        const messages = {}
        
        try {
            // Get locale URL from the HTML element
            const appElement = document.getElementById('make-an-offer')
            const langJSONUrl = appElement?.getAttribute('data-lang-asset')
            
            if (!langJSONUrl) {
                console.warn('No locale URL found, falling back to embedded messages')
                return { messages: { en: {} }, locale: 'en' }
            }
            
            // Load lang.json which already contains all locales in correct structure
            const langJSON = await fetch(langJSONUrl)
            const allMessages = await langJSON.json()
            
            // Ensure English exists as fallback
            if (!allMessages.en) {
                allMessages.en = {}
            }
            
            return { messages: allMessages, locale }
        } catch (error) {
            console.error('Failed to load locale messages:', error)
            return { messages: { en: {} }, locale: 'en' }
        }
    }
    
    const { messages, locale } = await loadLocaleMessages()
    
    const i18n = createI18n({
        legacy: false,
        locale: locale,
        fallbackLocale: 'en',
        messages
    })
    
    // Access block settings
    const loadBlockSettings = () => {
        try {
            const appElement = document.getElementById('make-an-offer')
            const settingsData = appElement?.getAttribute('data-settings')
            
            if (settingsData) {
                return JSON.parse(settingsData)
            }
            return {
                restrictOfferQuantity: false,
                restrictOfferByCustomer: false,
                hideMakeAnOfferButton: false,
                variantInventory: null
            }
        } catch (error) {
            console.error('Failed to load settings:', error)
            return {}
        }
    }
    
    const app = createApp({
        setup() {
            const { t } = VueI18n.useI18n()
            const toast = useToast();
            
            // Load settings after composables
            const settings = loadBlockSettings();
            
            const visible = ref(false);
            const email = ref(document.getElementById('customer_email').value);
            const offerPrice = ref(null);
            const quantity = ref(null);
            const note = ref(null);
            const productPrice = ref(parseFloat(document.getElementById('product_price').value.replace(/[^0-9.]/g, '').replace(/^\./, '')));
            const submittingOfferLoading = ref(false);
            const variantId = ref(ShopifyAnalytics?.meta?.product?.variants?.[0]?.id || '');
            const variantInventory = ref(settings?.variantInventory ?? null);
            const hasPendingOffer = ref(false);
            const restrictOfferQuantity = ref(settings?.restrictOfferQuantity || false);
            const restrictOfferByCustomer = ref(settings?.restrictOfferByCustomer || false);
            const hideMakeAnOfferButton = ref(settings?.hideMakeAnOfferButton || false);
            
            const isSoldOut = computed(() => {
                return variantInventory.value !== null && variantInventory.value <= 0;
            });

            const isButtonVisible = computed(() => {
                if (isSoldOut.value && hideMakeAnOfferButton.value) {
                    return false;
                }
                return true;
            });
            
            

            const resetForm = () => {
                offerPrice.value = null;
                quantity.value = null;
                note.value = null;
                submittingOfferLoading.value = false;
            }

            const handleCancel = () => {
                visible.value = false;
                resetForm();
            }

            const validateInventoryLimit = () => {
                if (restrictOfferQuantity.value && variantInventory.value !== null) {
                    if (quantity.value > variantInventory.value) {
                        toast.add({ 
                            severity: 'warn', 
                            summary: t('make_an_offer.limit_reached_summary'), 
                            detail: t('make_an_offer.inventory_limit_detail', { count: variantInventory.value }), 
                            life: 3000 
                        });
                        return false;
                    }
                }
                return true;
            }

            const validateCustomerOfferLimit = () => {
                if (restrictOfferByCustomer.value && hasPendingOffer.value) {
                    toast.add({ 
                        severity: 'warn', 
                        summary: t('make_an_offer.limit_reached_summary'), 
                        detail: t('make_an_offer.pending_offer_limit_detail'), 
                        life: 3000 
                    });
                    return false;
                }
                return true;
            }

            const makeOffer = async () => {
        
                submittingOfferLoading.value = true;
                try {
                    if (!offerPrice.value || !quantity.value || !email.value) {
                        toast.add({ 
                            severity: 'warn', 
                            summary: t('make_an_offer.validation_error_summary'), 
                            detail: t('make_an_offer.fill_required_fields_detail'), 
                            life: 3000 
                        });
                        return;
                    }

                    if (!validateInventoryLimit()) {
                        return;
                    }                   
                    const response = await fetch('https://api.shipturtle.com/api/v2/orders/create-shopify-draft-order', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            "shop_domain": Shopify.shop,
                            "variant_id": variantId.value,
                            "quantity": quantity.value,
                            "proposed_price": offerPrice.value,
                            "note": note.value,
                            "email": email.value
                        })
                    })
                    const data = await response.json(); 
                    if (response.status === 201) {
                        visible.value = false;
                        resetForm();
                        toast.add({ 
                            severity: 'success', 
                            summary: t('make_an_offer.success_summary'), 
                            detail: t('make_an_offer.offer_submitted_success_detail'), 
                            life: 3000 
                        });
                        hasPendingOffer.value = true;
                    } else {
                        toast.add({ 
                            severity: 'error', 
                            summary: t('make_an_offer.error_summary'), 
                            detail: data.message || t('make_an_offer.submit_offer_error_detail'), 
                            life: 3000 
                        });
                    }   
                } catch (error) {
                    toast.add({ 
                        severity: 'error', 
                        summary: t('make_an_offer.error_summary'), 
                        detail: t('make_an_offer.generic_error_detail'), 
                        life: 3000 
                    });
                } finally {
                    submittingOfferLoading.value = false;
                }
            }
            const checkInventoryAndOffer = async () => {
                if (!email.value) return;
                const response = await fetch('https://api.shipturtle.com/api/v2/variants/check-inventory-and-offers?variant_id=' + variantId.value + '&email=' + email.value + '&shop_domain=' + Shopify.shop, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                })
                const data = await response.json(); 
                variantInventory.value = parseInt(data.data.inventory_quantity);
                hasPendingOffer.value = data.data.has_pending_offer;
            }

            const showDialog = () => {
                try {
                    if (!validateCustomerOfferLimit()) {
                        return;
                    }

                    if(email.value) {
                        visible.value = true;
                    } else {
                        toast.add({ 
                            severity: 'warn', 
                            summary: t('make_an_offer.login_required_summary'), 
                            detail: t('make_an_offer.login_required_detail'), 
                            life: 3000 
                        });
                        setTimeout(() => {
                            window.location.href = "/account/login"
                        }, 1500);
                    }
                } catch (error) {
                    console.error('Error in showDialog:', error);
                }
            }
            // Variant handling
            const getVariantID = async () => {
                const urlParams = new URLSearchParams(window.location.search);
                const variantParam = urlParams.get('variant');
                if (variantParam) {
                    variantId.value = variantParam;
                } else {
                    variantId.value = ShopifyAnalytics?.meta?.selectedVariantId;
                }
                try {
                    await checkInventoryAndOffer();
                } catch (err) {
                    console.error(err);
                }
            };

            onUnmounted(() => {
                const productForm = document.querySelectorAll('product-form form[method="post"][action="/cart/add"]');
                if (productForm) {
                    productForm.forEach(form => {
                        form.removeEventListener('change', getVariantID);
                    });
                }
            });

            onBeforeMount(() => {
                try{
                    checkInventoryAndOffer();
                    // Add event listener for variant changes
                    const productForm = document.querySelectorAll('product-form form[method="post"][action="/cart/add"]');
                    if (productForm) {
                        productForm.forEach(form => {
                            form.addEventListener('change', getVariantID);
                        });
                    }
                } catch (error) {
                    console.log(error);
                }
            })
            return {
                t,
                showDialog,
                isSoldOut,
                isButtonVisible,
                visible,
                email,
                offerPrice,
                quantity,
                note,
                variantInventory,
                hasPendingOffer,
                submittingOfferLoading,
                handleCancel,
                makeOffer,
                productPrice
            };
        }
    }); 

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
    app.use(i18n);
    
    app.use(PrimeVue.Config, {
        theme: {
            preset: Noir,
            options: {
                darkModeSelector: false,
            }
        }
    });
    app.use(PrimeVue.ToastService);

    app.component('p-button', PrimeVue.Button);
    app.component('p-dialog', PrimeVue.Dialog);
    app.component('p-inputtext', PrimeVue.InputText);
    app.component('p-toast', PrimeVue.Toast);
    app.component('p-textarea', PrimeVue.Textarea);

    app.config.compilerOptions.delimiters = ['$%', '%'];
    app.mount('#make-an-offer');
}
(function() {
    'use strict';
    if (window.ST_Resources) {
        ST_Resources.loadDependencies(MakeAnOfferCode);
    } else {
        const interval = setInterval(() => {
            if (window.ST_Resources) {
                clearInterval(interval);
                ST_Resources.loadDependencies(MakeAnOfferCode);
            }
        }, 50);
    }
})();