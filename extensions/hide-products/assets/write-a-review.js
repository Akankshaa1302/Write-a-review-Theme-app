function writeaReviewCode() {
    const { createApp, ref, computed, onMounted } = Vue;
    const { useToast } = PrimeVue;
  
    const app = createApp({
      setup() {
        // Constants
        const baseURL = '/a/dashboard'
        const toast = useToast();
        
        // Dialog State
        const visible = ref(false)
        const submittingOfferLoading = ref(false)
        const offerSuccess = ref(false)
        const checkCustomerAbleToWrite = ref(false)
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
          email: window.isCustomerEmail || "",
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
              if (key === 'email') {
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
              toast.add({ severity: 'error', summary: 'Error', detail: 'All fields marked with * are required', life: 3000 });
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
              toast.add({ severity: 'error', summary: 'Error', detail: data.message || 'Error while submitting review', life: 3000 });
              return;
            }
            else {
              visible.value = false
              formState.errorMessage.value = null
              offerSuccess.value = true
              resetForm()
              toast.add({ severity: 'success', summary: 'Success', detail: data.message || 'Review submitted successfully', life: 3000 });
              fetchReviews();
            }
          } catch (error) {
            console.error("Error while submitting offer", error)
            toast.add({ severity: 'error', summary: 'Error', detail: "Error while submitting offer: " + (error.message || error), life: 3000 });
          }
          finally {
            submittingOfferLoading.value = false
          }
        }
        
        const showDialog = () => {
          try {
            if(window.isCustomerEmail) {
              checkCustomerAbleToWriteReview()
            } else {
              toast.add({ severity: 'warn', summary: 'Login Required', detail: 'Please log in to write a review', life: 3000 });
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
                "email": window.isCustomerEmail,
                "shop_domain": Shopify.shop,
                "product_id": ShopifyAnalytics.meta.product.id,
              }),
            })
            const data = await response.json()
            if (data.allowed) {
              visible.value = true
            } else {
              toast.add({ severity: 'error', summary: 'Error', detail: data.message || "Purchase required to write review.", life: 3000 });
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
                 const response = await fetch(`${baseURL}/fetch-product-page-reviews?product_id=${pId}&page=${page}&limit=${pageSize.value}`);
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
          onPage
        }
      },
    })
  
    app.config.compilerOptions.delimiters = ['$%', '%'];
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
    app.mount("#write-a-review");
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
    'https://unpkg.com/@primevue/themes/umd/aura.min.js'
  ];
  
  // 3) Load them all, then bootstrap
  Promise.all(deps.map(loadScript))
    .then(() => {
     writeaReviewCode()
    })
    .catch(err => {
      console.error('Dependency load error:', err);
    });
})();