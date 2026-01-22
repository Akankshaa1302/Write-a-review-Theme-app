async function writeaReview() {
    const { createApp, ref, onMounted } = Vue;
    const { createI18n } = VueI18n

    const { useToast } = PrimeVue;

    const getBlockSettings = () => {
      const app = document.getElementById('write-a-review-app')
      const blockSettings = JSON.parse(app?.getAttribute('data-block-settings'))

      return blockSettings || {
        fontSize: 'md'
      }
    }
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

    // Load locale messages and settings
    const loadLocaleMessages = async () => {
        const locale = getShopifyLocale()
        const messages = {}
        
        try {
            // Get locale URL from the HTML element
            const appElement = document.getElementById('write-a-review-app')
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

    const app = createApp({
      template: `
      <div id="write-a-review" v-cloak>
        <div class="reviews-container">
            <div class="reviews-summary">
                <h3>$% t('product-review.overall-rating') %</h3>
                <div class="average-rating-display">
                    <span class="average-score" style="font-size: 8rem; font-weight: bold;">$% averageRating %</span>
                    <span class="out-of">$% t('product-review.out-of-5') %</span>
                </div>
                <div>
                    <p-rating :model-value="Number(averageRating)" readonly :cancel="false"></p-rating>
                </div>
                <p class="based-on">$% t('product-review.based-on-reviews', { count: totalReviews }) %</p>

                <div class="rating-distribution">
                    <div v-for="star in [5, 4, 3, 2, 1]" :key="star" class="distribution-row">
                        <span class="star-label">$% t('product-review.star-label', { star: star }) %</span>
                        <div class="progress-bar-bg">
                        <div class="progress-bar-fill" :style="{ width: getProgressBarWidth(star) }"></div>
                        </div>
                        <span class="count-label">$% ratingDistribution[star - 1] %</span>
                    </div>
                </div>
            </div>

            <div class="vertical-divider"></div>

            <div class="reviews-list-container">
                <div class="reviews-cta-header">
                    <p-button class="write-a-review-button" size="large" @click="showDialog" :disabled="checkCustomerAbleToWrite" :loading="checkCustomerAbleToWrite">
                        $% userHasReviewed ? t('product-review.edit-your-review') : t('product-review.write-a-review-button') %
                    </p-button>
                    <div class="review-header">$% t('product-review.write-experience-text') %</div>
                </div>
                
                <div v-if="loadingReviews" class="loading-reviews">$% t('product-review.loading-reviews') %</div>
                <div v-else-if="reviews.length === 0" class="no-reviews">
                    <p>$% t('product-review.no-reviews') %</p>
                </div>
                <div v-else class="reviews-list">
                    <div v-for="(review, index) in reviews" :key="index" class="review-item">
                        <div class="review-header">
                            <span class="review-title" style="font-size: 2.2rem;">$% review.title %</span>
                        </div>
                        <div class="review-rating">
                            <p-rating :model-value="review.rating" readonly :cancel="false"></p-rating>
                        </div>
                        <div class="review-body">
                            <p>$% review.description %</p>
                        </div>
                        <div class="review-author">
                            <span>$% t('product-review.review-by') % $% review.given_by %</span>
                            <span class="review-date-separator" style="margin: 0 5px;">|</span>
                            <span class="review-date">$% formatDate(review.created_at) %</span>
                        </div>
                        <hr v-if="index < reviews.length - 1" class="review-divider"/>
                    </div>
                </div>
                
                <div class="st-ext-mt-6" v-if="totalCount > pageSize">
                    <p-paginator :rows="Number(pageSize)" :total-records="Number(totalCount)" v-model:first="first" @page="onPage" />
                </div>
            </div>
        </div>
        <p-toast position="top-right"></p-toast>
      
        <p-dialog modal v-model:visible="visible" @hide="handleCancel"
        :appendTo="'self'">
            <template #header>
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <span style="font-weight: bold; font-size: 1.25em;">$% t('product-review.leave-a-review') %</span>
                    <span style="display: inline-flex; align-items: center; gap: 5px; background: #e3f2fd; color: #1976d2; padding: 4px 10px; border-radius: 16px; font-size: 0.8rem; font-weight: 500;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#1976d2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                        $% t('product-review.verified-purchaser') %
                    </span>
                </div>
            </template>
            <form @submit.prevent="submitReview">
                <div class="form-group" style="text-align: center; margin-bottom: 1.5rem;">
                    <p-rating v-model="formFields.rating" :cancel="false" style="--p-icon-size: 3.5rem;"></p-rating>
                </div>

                <div class="form-group">
                    <label for="review_description">$% t('product-review.write-review-label') %</label>
                    <p-textarea style="width: 100% !important;" rows="6" id="review_description" v-model="formFields.review_description" required :placeholder="t('product-review.write-review-placeholder')"/>
                </div>

                <div class="form-group">
                    <label for="review_title">$% t('product-review.title-review-label') %</label>
                    <p-inputtext id="review_title" type="text" v-model="formFields.review_title" required :placeholder="t('product-review.title-review-placeholder')" class="form-input" />
                </div>

                <div class="form-group">
                    <label for="name">$% t('product-review.public-name-label') %</label>
                    <p-inputtext id="name" type="text" autocomplete="off" v-model="formFields.name" required :placeholder="t('product-review.public-name-placeholder')" class="form-input" />
                </div>

                <div class="form-group">
                    <label for="email">$% t('product-review.email-label') %</label>
                    <p-inputtext id="email" type="email" autocomplete="off" v-model="formFields.email" readonly required :placeholder="t('product-review.email-placeholder')" class="form-input" />
                </div>

              <div class="honeypot-fields">
                    <p-inputtext type="text" id="honeypotNameFieldName" name="honeypot_name_field_name" />
                    <p-inputtext type="text" id="honeypotValidFromFieldName" name="honeypot_valid_from_field_name" />
                </div>

                <div class="offer-action-buttons">
                    <p-button type="button" size="large" severity="secondary" @click="handleCancel" class="cancel-btn">$% t('product-review.cancel') %</p-button>
                    <p-button class="offers-submit-btn" :disabled="submittingOfferLoading" type="submit" size="large" severity="primary">
                        $% userHasReviewed ? t('product-review.update-review') : t('product-review.submit-review') %
                        <svg v-if="submittingOfferLoading" width="15" height="15" aria-hidden="true" focusable="false" class="spinner" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">
                            <circle class="path" fill="none" stroke-width="6" cx="33" cy="33" r="30"></circle>
                        </svg>
                    </p-button>
                    <p-button 
                        v-if="userHasReviewed" 
                        type="button" 
                        class="delete-review-btn" 
                        severity="danger" 
                        @click="deleteReview" 
                        :loading="submittingDeleteLoading"
                        :label="t('product-review.delete-review')"
                    ></p-button>
                </div>
            </form>
        </p-dialog>

        <p-dialog :header="t('product-review.confirm-delete-header')" modal v-model:visible="deleteConfirmationVisible" class="delete-confirm-dialog" :appendTo="'self'">
            <span class="p-text-secondary block mb-5 confirm-delete-message">$% t('product-review.confirm-delete-message') %</span>
            <div class="flex justify-content-center gap-2 confirm-delete-actions">
                <p-button :label="t('product-review.cancel')" severity="secondary" @click="deleteConfirmationVisible = false" class="cancel-btn"></p-button>
                <p-button :label="t('product-review.delete-review')" severity="danger" @click="confirmDeleteReview" :loading="submittingDeleteLoading" class="delete-confirm-btn"></p-button>
            </div>
        </p-dialog>
    </div>
      `,
      setup() {
        const { t } = VueI18n.useI18n()
        // Constants
        const baseURL = '/a/dashboard'
        const toast = useToast();
        
        // Dialog State
        const visible = ref(false)
        const submittingOfferLoading = ref(false)
        const offerSuccess = ref(false)
        const checkCustomerAbleToWrite = ref(false)
        const userHasReviewed = ref(false);

        const submittingDeleteLoading = ref(false);
        const deleteConfirmationVisible = ref(false);
        // Reviews State
        const reviews = ref([]);
        const loadingReviews = ref(false);
        const averageRating = ref(0);
        const totalReviews = ref(0);
        const ratingDistribution = ref([0, 0, 0, 0, 0]);

        const pageSize = ref(5);
        const totalCount = ref(0);
        const first = ref(0);
        const currentPage = ref(1);

        const honeypotData = ref({
          nameFieldName: '',
          validFromFieldName: '',
          encryptedValidFrom: ''
        });
        
        const formFields = ref({
          name: `${window.customerFirstName || ''} ${window.customerSecondName || ''}`.trim(),
          email: window.customerEmail || "",
          review_title: "",
          rating: 0,
          review_description: ""
        })
    
        const formState = {
          error: ref(false),
          errorMessage: ref(null),
        }
  
        const resetForm = () => {
          try {
            Object.keys(formFields.value).forEach(key => {
              if (key === 'email' || key === 'name') {
                return;
              }
              if (typeof formFields.value[key] === 'number') {
                  formFields.value[key] = 0;
              } else {
                  formFields.value[key] = "";
              }
            });
            formState.error.value = false;
            formState.errorMessage.value = null;

          } catch (error) {
            console.error('Error in resetForm:', error);
          }
        };



        const handleCancel = () => {
          try {
            visible.value = false
            resetForm()
          } catch (error) {
            console.error('Error in handleCancel:', error);
          }
        }
  
        const validateForm = () => {
          try {
            const requiredFields = [
              'name', 'email', 'review_description', 'review_title'
            ]
            
            let isValid = true
            isValid = requiredFields.every(field => 
              formFields.value[field]?.trim())
            
            if(formFields.value.rating === 0) isValid = false;

            if (!isValid) {
              toast.add({ 
                severity: 'error', 
                summary: t('product-review.toast-error'), 
                detail: t('product-review.toast-all-fields-required'), 
                life: 3000 
              });
            }
    
            return isValid
          } catch (error) {
            console.error('Error in validateForm:', error);
            return false;
          }
        }
  
        const submitReview = async () => {
          if (!validateForm()) return
  
          submittingOfferLoading.value = true
          const pId = ShopifyAnalytics?.meta?.product?.id;
          const vId = ShopifyAnalytics?.meta?.product?.variants?.[0]?.id;

          try {
            const response = await fetch(baseURL + "/post-product-reviews", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                  "shop_domain": Shopify.shop,
                  "product_id": pId,
                  "variant_id": vId,
                  "name": formFields.value.name,
                  "email": formFields.value.email,
                  "title": formFields.value.review_title,
                  "ratings": formFields.value.rating,
                  "description": formFields.value.review_description,
                  "honeypot_enabled": true,

                  [honeypotData.value.nameFieldName]: null,
                  [honeypotData.value.validFromFieldName]: honeypotData.value.encryptedValidFrom,
              }),
            })
  
            const data = await response.json();
            
            if (!response.ok) {
              toast.add({ 
                severity: 'error', 
                summary: t('product-review.toast-error'), 
                detail: data.message || t('product-review.toast-error-submitting'), 
                life: 3000 
              });
              return;
            }
            else {
              visible.value = false
              formState.errorMessage.value = null
              offerSuccess.value = true
              resetForm()
              toast.add({ 
                severity: 'success', 
                summary: t('product-review.toast-success'), 
                detail: data.message || t('product-review.toast-review-submitted'), 
                life: 3000 
              });
              fetchReviews();
            }
          } catch (error) {
            console.error("Error while submitting offer", error)
            const errorMsg = t('product-review.toast-error-submitting-offer', { 
              error: error.message || error 
            })
            toast.add({ 
              severity: 'error', 
              summary: t('product-review.toast-error'), 
              detail: errorMsg, 
              life: 3000 
            });
          }
          finally {
            submittingOfferLoading.value = false
          }
        }
        
        
        const deleteReview = () => {
            deleteConfirmationVisible.value = true;
        }

        const confirmDeleteReview = async () => {
            submittingDeleteLoading.value = true;
            try {
                const response = await fetch(baseURL + "/delete-product-review", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        product_id: ShopifyAnalytics?.meta?.product?.id,
                        email: window.customerEmail
                    })
                });
                const data = await response.json();
                if (response.ok) {
                    toast.add({ severity: 'success', summary: 'Success', detail: data.message || 'Review deleted successfully', life: 3000 });
                    visible.value = false;
                    deleteConfirmationVisible.value = false;
                    userHasReviewed.value = false;

                    resetForm();
                    fetchReviews();
                } else {
                    toast.add({ severity: 'error', summary: 'Error', detail: data.message || 'Error deleting review', life: 3000 });
                }
            } catch(e) {
                console.error(e);
                toast.add({ severity: 'error', summary: 'Error', detail: 'Error deleting review', life: 3000 });
            } finally {
                submittingDeleteLoading.value = false;
            }
        }

         const showDialog = () => {
          try {
            if(window.customerEmail) {
              checkCustomerAbleToWriteReview()
            } else {
              toast.add({ 
                severity: 'warn', 
                summary: t('product-review.toast-login-required'), 
                detail: t('product-review.toast-login-required-detail'), 
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

        const checkCustomerAbleToWriteReview = async () => {
          checkCustomerAbleToWrite.value = true
          try{
            const response = await fetch(baseURL + "/check-review-eligibility", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                "email": window.customerEmail,
                "shop_domain": Shopify.shop,
                "product_id": ShopifyAnalytics.meta.product.id,
              }),
            })
            const data = await response.json()
            if (data.allowed) {
              visible.value = true
               if (data.has_review && data.review) {
                  userHasReviewed.value = true;

                  formFields.value = {
                      name: data.review.given_by || formFields.value.name,
                      email: data.review.email || formFields.value.email,
                      review_title: data.review.title || "",
                      rating: Number(data.review.ratings) || 0,
                      review_description: data.review.description || ""
                  };
              } else {
                   resetForm();
              }
            } else {
              toast.add({ 
                severity: 'error', 
                summary: t('product-review.toast-error'), 
                detail: data.message || t('product-review.toast-purchase-required'), 
                life: 3000 
              });
            }
          }
          catch(error){
            console.error("Error while checking customer able to write", error)
          }
          finally{
            checkCustomerAbleToWrite.value = false
          }
        }

        const fetchReviews = async (page = 1) => {
             loadingReviews.value = true;
             try {
                 const pId = window.productId || ShopifyAnalytics?.meta?.product?.id;
                 const response = await fetch(`${baseURL}/fetch-product-page-reviews?product_id=${pId}&page=${page}&limit=${pageSize.value}&email=${window.customerEmail}`);
                 if (response.ok) {
                     const data = await response.json();
                     
                     const isPaginated = data.reviews && typeof data.reviews === 'object' && !Array.isArray(data.reviews);
                     const reviewsData = isPaginated ? (data.reviews.data || []) : (data.reviews || []);
                     
                     reviews.value = reviewsData.map(review => ({
                        ...review,
                        rating: review.ratings
                     }));
                     
                     averageRating.value = data.avg || 0;
                     totalReviews.value = data.count || 0;
                     
                     totalCount.value = isPaginated ? (data.reviews.total || data.count || 0) : (data.count || 0);
                     currentPage.value = isPaginated ? (data.reviews.current_page || page) : page;
                     
                     ratingDistribution.value = data.rating_star_count || [0,0,0,0,0];
                     userHasReviewed.value = data.user_has_reviewed;
                     
                 } else {
                     console.error("Failed to fetch reviews");
                 }
             } catch (error) {
                 console.error("Error fetching reviews:", error);
             } finally {
                 loadingReviews.value = false;
             }
        }

        const formatDate = (dateString) => {
          try {
            if(!dateString) return '';
            return new Date(dateString).toLocaleDateString();
          } catch (error) {
            console.error('Error in formatDate:', error);
            return '';
          }
        }

        const getProgressBarWidth = (star) => {
          try {
            if (totalReviews.value === 0) return '0%';
            const count = ratingDistribution.value[star - 1] || 0;
            const percentage = (count / totalReviews.value) * 100;
            return `${percentage}%`;
          } catch (error) {
            console.error('Error in getProgressBarWidth:', error);
            return '0%';
          }
        }

        const onPage = (event) => {
          first.value = event.first;
          const page = Math.floor(event.first / pageSize.value) + 1;
          fetchReviews(page);
        }
        
        const getHoneyPot = async () => {
          try {
            const res = await fetch('https://api.beta.shipturtle.app/api/v2/honeypot-data');
            const { honeypot } = await res.json();
            
            honeypotData.value = {
              nameFieldName: honeypot.nameFieldName,
              validFromFieldName: honeypot.validFromFieldName,
              encryptedValidFrom: honeypot.encryptedValidFrom
            };
            
            const honeypotNameFieldEl = document.getElementById('honeypotNameFieldName');
            const honeypotValidFromFieldEl = document.getElementById('honeypotValidFromFieldName');
          
            if (honeypotNameFieldEl) {
              honeypotNameFieldEl.setAttribute('name', honeypot.nameFieldName);
            }
            if (honeypotValidFromFieldEl) {
              honeypotValidFromFieldEl.setAttribute('name', honeypot.validFromFieldName);
              honeypotValidFromFieldEl.value = honeypot.encryptedValidFrom;
            }
          } catch (error) {
            console.error('Error fetching honeypot data:', error);
          }
        }
        onMounted(() => {
          fetchReviews();
          getHoneyPot();
        })
  
        return {
          t,
          checkCustomerAbleToWrite,
          showDialog,
          submittingOfferLoading,
          offerSuccess,
          visible,
          formFields,
          formError: formState.error,
          formErrorMessage: formState.errorMessage,
          handleCancel,
          submitReview,
          reviews,
          loadingReviews,
          averageRating,
          totalReviews,
          ratingDistribution,
          formatDate,
          getProgressBarWidth,
          pageSize,
          totalCount,
          first,
          onPage,
          userHasReviewed,
          deleteReview,
          confirmDeleteReview,
          deleteConfirmationVisible,
          submittingDeleteLoading
        }
      },
    })
  
    app.config.compilerOptions.delimiters = ['$%', '%'];

    app.use(i18n)
    app.use(PrimeVue.Config, {
      theme: {
        preset: PrimeVue.Themes.Aura,
        options: {
          darkModeSelector: false,
        }
      }
    });
  
    // Register PrimeVue components
    app.use(PrimeVue);
    app.use(PrimeVue.ToastService);
    app.component("p-button", PrimeVue.Button);
    app.component("p-dialog", PrimeVue.Dialog);
    app.component("p-inputtext", PrimeVue.InputText);
    app.component("p-textarea", PrimeVue.Textarea);
    app.component("p-toast", PrimeVue.Toast);
    app.component("p-radiobutton", PrimeVue.RadioButton);
    app.component("p-fileupload", PrimeVue.FileUpload);
    app.component("p-rating", PrimeVue.Rating);
    app.component("p-paginator", PrimeVue.Paginator);
  
    app.config.compilerOptions.delimiters = ["$%", "%"];
    app.mount("#write-a-review-app");
}
  
(function() {
    'use strict';
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload  = () => resolve(src);
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }
  
  // 2) List all your dependency URLs in order
  const deps = [
    'https://unpkg.com/vue@3/dist/vue.global.js',
    'https://unpkg.com/primevue/umd/primevue.min.js',
    'https://unpkg.com/@primevue/themes/umd/aura.min.js',
    'https://unpkg.com/vue-i18n@9/dist/vue-i18n.global.js'
  ];
  
  // 3) Load them all, then bootstrap
  Promise.all(deps.map(loadScript))
    .then(() => {
      writeaReview()
    })
    .catch(err => {
      console.error('Dependency load error:', err);
    });
})();
