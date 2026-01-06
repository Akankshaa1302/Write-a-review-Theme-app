function MakeAnOfferCode(){
    const { createApp, ref } = Vue;

    const app = createApp({
        setup() {
            const visible = ref(false);
            const email = ref(document.getElementById('customer_email').value);
            const offerPrice = ref(null);
            const quantity = ref(null);
            const note = ref(null);
            const formError = ref(false)
            const formErrorMessage = ref(null)
            const productPrice = ref(parseFloat(document.getElementById('product_price').value.replace(/[^0-9.]/g, '').replace(/^\./, '')));
            const submittingOfferLoading = ref(false);
            

            const resetForm = () => {
                offerPrice.value = null;
                quantity.value = null;
                note.value = null;
                formError.value = false;
                formErrorMessage.value = null;
                submittingOfferLoading.value = false;
            }

            const handleCancel = () => {
                visible.value = false;
                resetForm();
            }

            const makeOffer = async () => {
                submittingOfferLoading.value = true;
                formError.value = false;
                if (!offerPrice.value || !quantity.value || !email.value) {
                    formError.value = true;
                    formErrorMessage.value = 'Please fill in all the required fields'
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
                            "variant_id": ShopifyAnalytics.meta.product.variants[0]?.id,
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
                    formErrorMessage.value = null;
                    resetForm();
                } else {
                    formError.value = true;
                    formErrorMessage.value = data.message || 'Error while submitting offer';
                }   
                submittingOfferLoading.value = false;
            }

            return {
                visible,
                email,
                offerPrice,
                quantity,
                note,
                submittingOfferLoading,
                handleCancel,
                makeOffer,
                formError,
                productPrice,
                formErrorMessage
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

    app.component('p-button', PrimeVue.Button);
    app.component('p-dialog', PrimeVue.Dialog);
    app.component('p-inputtext', PrimeVue.InputText);
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