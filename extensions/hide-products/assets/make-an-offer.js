function MakeAnOfferCode(){
    const { createApp, ref, onBeforeMount, computed, onUnmounted } = Vue;
    const { useToast } = PrimeVue;

    const app = createApp({
        setup() {
            const toast = useToast();
            const visible = ref(false);
            const email = ref(document.getElementById('customer_email').value);
            const offerPrice = ref(null);
            const quantity = ref(null);
            const note = ref(null);
            const productPrice = ref(parseFloat(document.getElementById('product_price').value.replace(/[^0-9.]/g, '').replace(/^\./, '')));
            const submittingOfferLoading = ref(false);
            const variantId = ref(ShopifyAnalytics.meta.product.variants[0]?.id);
            const variantInventory = ref(window.makeAnOfferSettings?.variantInventory ?? null);
            const hasPendingOffer = ref(false);
            const restrictOfferQuantity = ref(window.makeAnOfferSettings?.restrictOfferQuantity || false);
            const restrictOfferByCustomer = ref(window.makeAnOfferSettings?.restrictOfferByCustomer || false);
            const hideMakeAnOfferButton = ref(window.makeAnOfferSettings?.hideMakeAnOfferButton || false);

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
                            summary: 'Limit Reached', 
                            detail: 'Quantity cannot exceed available inventory. ' + variantInventory.value + ' items available.', 
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
                            summary: 'Limit Reached', 
                            detail: 'You already have an pending offer for this product.', 
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
                            summary: 'Validation Error', 
                            detail: 'Please fill in all the required fields', 
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
                        body: JSON.stringify(
                            {
                                "shop_domain": Shopify.shop,
                                "variant_id": variantId.value,
                                "quantity": quantity.value,
                                "proposed_price": offerPrice.value,
                                "note": note.value,
                                "email": email.value
                            }
                        )
                    })
                    const data = await response.json(); 
                    if (response.status === 201) {
                        visible.value = false;
                        resetForm();
                        toast.add({ 
                            severity: 'success', 
                            summary: 'Success', 
                            detail: 'Offer submitted successfully!', 
                            life: 3000 
                        });
                        hasPendingOffer.value = true;
                    } else {
                        toast.add({ 
                            severity: 'error', 
                            summary: 'Error', 
                            detail: data.message || 'Error while submitting offer', 
                            life: 3000 
                        });
                    }   
                } catch (error) {
                    toast.add({ 
                        severity: 'error', 
                        summary: 'Error', 
                        detail: 'An error occurred while processing your request.', 
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
                        summary: 'Login Required', 
                        detail: 'Please login to make an offer', 
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
        'https://unpkg.com/vue@3/dist/vue.global.js',
        'https://unpkg.com/primevue/umd/primevue.min.js',
        'https://unpkg.com/@primevue/themes/umd/aura.min.js'
    ];

    // 3) Load them all, then bootstrap
    Promise.all(deps.map(loadScript))
    .then(() => {
        MakeAnOfferCode()
    })
    .catch(err => {
        console.error('Dependency load error:', err);
    });
})();