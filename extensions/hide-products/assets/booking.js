function BookingRentalAndAppointment() {
    const TimeSlotSelector = {
        name: 'TimeSlotSelector',
        props: ['slots', 'bookedSlots', 'checkingAvailability'],
        emits: ['select'],
        template: `
            <div class="time-slots-wrapper">
              <div
                v-for="slot in slots"
                class="st-appointment-radiobtn"
                :class="{ selected: selectedSlot === slot.value }"
                @click="selectSlot(slot)"
                :style="{
                  'background-color': bookedSlots.includes(slot.value) ? 'grey' : 'transparent',
                  'pointer-events': bookedSlots.includes(slot.value) ? 'none' : 'all'
                }"
              >
                <input
                  type="radio"
                  :id="slot.value"
                  :value="slot.value"
                  style="display: none;"
                />
                <label :for="slot.value">%% slot.label %%</label>
              </div>
            </div>
          `,
        setup(props, { emit }) {
          // Local state
          const selectedSlot = ref(null);
      
          // Computed
          const isCheckingAvailability = computed(() => props.checkingAvailability);
      
          // Methods
          function selectSlot(slot) {
            selectedSlot.value = slot.value;
            emit('select', slot.value);
          }
      
          return {
            selectedSlot,
            selectSlot,
            isCheckingAvailability
          };
        },
        delimiters: ['%%', '%%']
    }

    const {
    createApp,
    ref,
    computed,
    watch,
    onMounted
    } = Vue;

    const app = createApp({
        components: {
            VueDatePicker,
            TimeSlotSelector
        },
        setup() {
            // ==========================
            // DATA (reactive references)
            // ==========================
            const quantitySelected = ref(1);
            const checkingAvailability = ref(false);
            const fetchingAvailableSlots = ref(false);
            const productId = ref(ShopifyAnalytics.meta.product.id);
            const variantId = ref(ShopifyAnalytics.meta.product.variants[0].id);
            const baseURL = ref('https://api.shipturtle.com/api');
            const addingToCart = ref(false);

            // Booking type fields
            const productTypeCheck = ref(null);
            const isBookingType = ref(null);
            const bookingRule = ref({});
            const ruleId = ref(null);

            // Date related fields
            const leadTime = ref(null);
            const cutoffDays = ref(null);
            const bookedDates = ref([]);
            const disabledDates = ref([]);

            // Rental specific fields
            const selectedRentalDate = ref(null);
            const isSelectedRentalDateValid = ref(true);
            const rentalTime = ref(null);
            const availableAndBookedRentalTimeSlots = ref([]);
            const startDate = ref(null);
            const endDate = ref(null);

            // Appointment specific fields
            const appointmentDate = ref(null);
            const appointmentTime = ref(null);
            const availableAndBookedAppointmentTimeSlots = ref([]);
            const daysOfAWeek = ref([
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday'
            ]);

            // For error handling
            const errorMessage = ref(null);

            // Block settings
            const blockSettings = computed(() => {
                try {
                    const appElement = document.getElementById('st-booking-and-rental')
                    const settingsData = JSON.parse(appElement?.getAttribute('data-settings'))
        
                    return {
                        autoSelectLastDate: settingsData.auto_select_last_date,
                        quantitySelectorId: settingsData.quantity_selector_id,
                        buyButtonsId: settingsData.buy_buttons_id
                    }
                } catch (error) {
                    console.error('Error loading block settings:', error)
                    return {
                        autoSelectLastDate: false,
                        quantitySelectorId: null,
                        buyButtonsId: null
                    }
                }
            })

            // ==========================
            // METHODS
            // ==========================

            // ---------- RENTAL ----------
            async function addToCartDailyRentalProduct() {
            try {
                addingToCart.value = true;
                if (selectedRentalDate.value && isSelectedRentalDateValid.value && numberofDaysSelected.value > 0) {
                await axios.post('/cart/add.js', {
                    items: [{
                    id: variantId.value,
                    quantity: quantitySelected.value * numberofDaysSelected.value,
                    properties: {
                        'Start Date': startDate.value,
                        'End Date': endDate.value,
                        'Product Type': 'Rental'
                    }
                    }]
                });
                window.location.href = '/cart';
                } else {
                errorMessage.value = 'Please select a valid date';
                }
            } catch (error) {
                console.error('Error adding to cart:', error);
            } finally {
                addingToCart.value = false;
            }
            }

            async function addToCartHourlyRentalProduct() {
            try {
                addingToCart.value = true;
                if (selectedRentalDate.value && rentalTime.value) {
                await axios.post('/cart/add.js', {
                    items: [{
                    id: variantId.value,
                    quantity: quantitySelected.value,
                    properties: {
                        'Date': formatDate(selectedRentalDate.value),
                        'Time': rentalTime.value,
                        'Product Type': 'Rental'
                    }
                    }]
                });
                window.location.href = '/cart';
                } else {
                errorMessage.value = 'Please select a valid date and time';
                }
            } catch (error) {
                console.error('Error adding to cart:', error);
            } finally {
                addingToCart.value = false;
            }
            }

            function setRentalTime(value) {
            rentalTime.value = value;
            }

            async function checkAvailability(payload) {
            try {
                try {
                    const { data } = await axios.post(`${baseURL.value}/v2/check-availability`, payload);
                    return data;
                } catch (error) {
                    console.error('Error fetching cart:', error);
                }

            } catch (error) {
                console.error(error.message);
            }
            }

            async function checkProductAvailabilityOnTheSelectedDate() {
            try {
                checkingAvailability.value = true;
                isSelectedRentalDateValid.value = true;
                errorMessage.value = null;

                const { data: cartItems } = await axios.get('/cart.js');
                const itemInCart = cartItems.items.find((item) => item.id === variantId.value)
                const totalQuantity = itemInCart ? (itemInCart.quantity + quantitySelected.value ) : quantitySelected.value
                const payload = {
                    startDate: startDate.value,
                    endDate: endDate.value,
                    itemRequested: totalQuantity,
                    ruleId: ruleId.value,
                    productId: productId.value
                    };
                const data = await checkAvailability(payload);
                if (!data.availability) {
                    isSelectedRentalDateValid.value = false;
                    errorMessage.value = data.message + ' Or check if you have added some items to your basket already.';
                    selectedRentalDate.value = null;
                }
            } catch (error) {
                console.error('Error checking availability:', error);
            } finally {
                checkingAvailability.value = false;
            }
            }

            async function checkRentalSlotAvailability(value) {
            checkingAvailability.value = true;
            errorMessage.value = null;

            const payload = {
                itemRequested: quantitySelected.value,
                ruleId: ruleId.value,
                productId: productId.value,
                timeSlot: value,
                date: formatDate(selectedRentalDate.value)
            };
            const data = await checkAvailability(payload);
            checkingAvailability.value = false;

            if (!data.availability) {
                rentalTime.value = null;
                errorMessage.value = data.message;
                return;
            }
            rentalTime.value = value;
            }

            // ---------- APPOINTMENT ----------
            async function addToCartAppointmentProduct() {
            try {
                addingToCart.value = true;
                await axios.post('/cart/add.js', {
                items: [{
                    id: variantId.value,
                    quantity: quantitySelected.value,
                    properties: {
                    'Date': formatDate(appointmentDate.value),
                    'Time': appointmentTime.value,
                    'Product Type': 'Appointment'
                    }
                }]
                });
                window.location.href = '/cart';
            } catch (error) {
                console.error('Error adding to cart:', error);
            } finally {
                addingToCart.value = false;
            }
            }

            function setAppointmentTime(value) {
            appointmentTime.value = value;
            }

            async function checkAppointmentSlotAvailability(value) {
            checkingAvailability.value = true;
            errorMessage.value = null;

            const payload = {
                itemRequested: quantitySelected.value,
                ruleId: ruleId.value,
                productId: productId.value,
                timeSlot: value,
                date: formatDate(appointmentDate.value)
            };

            const data = await checkAvailability(payload);
            checkingAvailability.value = false;

            if (!data.availability) {
                appointmentTime.value = null;
                errorMessage.value = data.message;
                return;
            }
            appointmentTime.value = value;
            }

            // ---------- COMMON ----------
            async function fetchAvailableDates() {
                fetchingAvailableSlots.value = true;
                const formData = new FormData();
                formData.append('id', productId.value);
                try {
                    const res = await axios.post(`${baseURL.value}/v2/fetch-available-dates`, formData);
                    bookedDates.value = res.data.booked_dates;
                } catch (error) {
                    console.error('The error : ', error);
                } finally {
                    fetchingAvailableSlots.value = false;
                }
            }

            function formatDate(date) {
            return dateFns.format(date, 'yyyy-MM-dd');
            }

            function updateSelectedQuantity(value) {
            if (value <= 0) quantitySelected.value = 1;
            else quantitySelected.value = value;
            }

            function decrementQuantity() {
            if (quantitySelected.value - 1 > 0) {
                --quantitySelected.value;
            } else {
                quantitySelected.value = 1;
            }
            }

            function incrementQuantity() {
            ++quantitySelected.value;
            }

            async function fetchRentalTimeSlots(date) {
                const formattedDate = dateFns.format(new Date(date), 'yyyy-MM-dd');
                const formData = new FormData();
                formData.append('id', productId.value);
                formData.append('date', formattedDate);
                availableAndBookedRentalTimeSlots.value = await fetchAvailableAndBookedTimeSlots(formData);
            }

            async function fetchAppointmentTimeSlots() {
                fetchingAvailableSlots.value = true;
                const formData = new FormData();
                formData.append('id', productId.value);
                formData.append('date', formatDate(appointmentDate.value));
                availableAndBookedAppointmentTimeSlots.value = await fetchAvailableAndBookedTimeSlots(formData);
                fetchingAvailableSlots.value = false;
            }

            async function fetchAvailableAndBookedTimeSlots(formData) {
                try {
                    const { data } = await axios.post(`${baseURL.value}/v2/fetch-single-date-slots`, formData);
                    return data;
                } catch (error) {
                    console.error('The error : ', error);
                }
            }

            async function handleAddToCart() {
                if (bookingType.value === 'rental') {
                    if (isHourlyDuration.value) {
                        addToCartHourlyRentalProduct();
                    } else {
                        addToCartDailyRentalProduct();
                    }
                } else {
                    addToCartAppointmentProduct();
                }
            }

            async function initializeBooking() {
                try {
                    const loadingSpinner = document.getElementById('booking-loading-spinner');
                    const quantitySelectorElement = document.getElementById(blockSettings.value.quantitySelectorId);
                    const buyButtonsElement = document.getElementById(blockSettings.value.buyButtonsId);

                    const { data } = await axios.get(`${baseURL.value}/v2/get-product-booking-type/${productId.value}`);
                    isBookingType.value = data.is_booking_type;
                    ruleId.value = data.rule_id;

                    if (isBookingType.value) {
                        if (quantitySelectorElement) quantitySelectorElement.style.display = "none";
                        if (buyButtonsElement) buyButtonsElement.style.display = "none";
                        
                        loadingSpinner.style.display="block"
                        
                        const { data: ruleData } = await axios.get(
                            `${baseURL.value}/v2/products-rental-booking-rules/${ruleId.value}`
                        );
        
                        bookingRule.value = ruleData;

                        if (bookingRule.value.booking_type === 'rental') {
                            await fetchAvailableDates();
                            // If the duration format is not Days, then it is hourly
                            isHourlyDuration.value = (bookingRule.value.fixed_booking_time_duration.format !== 'Days');
                        }

                        loadingSpinner.style.display = 'none';

                        const el = document.getElementById('st-booking-and-rental');
                        if (el) el.style.display = 'block';
                    } else {
                        loadingSpinner.style.display = 'none';
                    }

                } catch (error) {
                    console.error('The error : ', error);
                }
            }

            // ==========================
            // COMPUTED
            // ==========================

            const bookingTitle = computed(() => {
            return bookingRule.value?.booking_type === 'rental' ? window.translations.rentThisProduct : window.translations.bookAppointment;
            });

            const cutoffDate = computed(() => {
                return dateFns.addDays(new Date(), Number(bookingRule.value?.date_picker?.cutoff_days?.time));
            });

            const futureDays = computed(() => {
                return dateFns.addDays(new Date(), Number(bookingRule.value?.date_picker?.future_days));
            });

            const markers = computed(() => {
                let dates = [];
                if (blackoutDates.value) {
                    dates = blackoutDates.value.map(date => ({
                    date: new Date(date),
                    type: 'dot',
                    tooltip: [{ text: 'Not Available', color: 'black' }]
                    }));
                }
                return dates;
            });

            const isOneDayDurationRentalTypeWithAutoSelect = computed(() => {
                return blockSettings.value.autoSelectLastDate && Number(duration.value) === 1; 
            })

            const rangeConfig = computed(() => {
                if (isHourlyDuration.value || isOneDayDurationRentalTypeWithAutoSelect.value) return false;

                return {
                    minMaxRawRange: true,
                    autoRange: blockSettings.value.autoSelectLastDate ?  Number(duration.value) - 1 : false
                };
            });

            const duration = computed (() => {
                return bookingRule.value?.fixed_booking_time_duration?.time
            })

            const durationFormat = computed (() => {
                return bookingRule.value?.fixed_booking_time_duration?.format
            })
            const numberofDaysSelected = computed(() => {

                if (isOneDayDurationRentalTypeWithAutoSelect.value) return 1;

                if (!selectedRentalDate.value[0] || !selectedRentalDate.value[1]) return 0;
                
                const differenceInDays = dateFns.differenceInDays(
                    selectedRentalDate.value[1],
                    selectedRentalDate.value[0]
                ) + 1;
                return differenceInDays / duration.value;
            });

            const availableRentalTimeSlots = computed(() => {
                return availableAndBookedRentalTimeSlots.value?.available_slots?.map(slot => {
                    return {
                        value: slot.from_time + '-' + slot.to_time,
                        label: slot.from_time + '-' + slot.to_time
                    };
                });
            });

            const bookedRentalTimeSlots = computed(() => {
                return availableAndBookedRentalTimeSlots.value?.booked_slots?.map(
                    slot => slot.from_time + '-' + slot.to_time
                );
            });

            const availableAppointmentTimeSlots = computed(() => {
                return availableAndBookedAppointmentTimeSlots.value?.available_slots?.map(slot => {
                    return {
                    value: slot.from_time + '-' + slot.to_time,
                    label: slot.from_time + '-' + slot.to_time
                    };
                });
            });

            const bookedAppointmentTimeSlots = computed(() => {
                return availableAndBookedAppointmentTimeSlots.value?.booked_slots?.map(
                    slot => slot.from_time + '-' + slot.to_time
                );
            });

            const bookingType = computed(() => {
                return bookingRule.value?.booking_type;
            });

            const blackoutDates = computed(() => {
                return bookingRule.value?.blackout_dates;
            });

            // Keep this separate so we can set it after isBookingType is known
            const isHourlyDuration = ref(false);

            const closedDays = computed(() => {
            const closed = [];
            if (bookingType.value === 'appointment') {
                for (const [key, val] of Object.entries(bookingRule.value.operating_hours)) {
                if (!val.slot_status) {
                    closed.push(daysOfAWeek.value.indexOf(key));
                }
                }
            }
            return closed;
            });

            const isAddToCartBtnDisabled = computed(() => {
            if (bookingType.value === 'rental') {
                if (isHourlyDuration.value) {
                return !selectedRentalDate.value ||
                        !rentalTime.value ||
                        checkingAvailability.value ||
                        addingToCart.value;
                } else {
                return !selectedRentalDate.value ||
                        !isSelectedRentalDateValid.value ||
                        checkingAvailability.value ||
                        addingToCart.value;
                }
            } else if (bookingType.value === 'appointment') {
                return !appointmentDate.value ||
                    !appointmentTime.value ||
                    checkingAvailability.value ||
                    addingToCart.value;
            }
            return true;
            });

            // ==========================
            // WATCHERS
            // ==========================

            // Rental related watchers
            watch(quantitySelected, (newVal) => {
                selectedRentalDate.value = null;
                appointmentDate.value = null;
            });

            watch(selectedRentalDate, async (newVal) => {
                if (newVal) {
                    errorMessage.value = ''

                    if (!isHourlyDuration.value) {
                        
                        if (isOneDayDurationRentalTypeWithAutoSelect.value) {
                            // Set end date and start date to the same date.
                            startDate.value = formatDate(newVal);
                            endDate.value = formatDate(newVal);

                            await checkProductAvailabilityOnTheSelectedDate();
                        } else {
                            startDate.value = formatDate(newVal[0]);
                            endDate.value = formatDate(newVal[1]);

                            const differenceInDays = dateFns.differenceInDays(
                                newVal[1],
                                newVal[0]
                            ) + 1;

                            const isSelectedDateMultipleOftheDuration = differenceInDays % duration.value;

                            if (isSelectedDateMultipleOftheDuration != 0) {
                                selectedRentalDate.value = null
                                errorMessage.value = window.translations.selectDateRangeDuration;
                                return;
                            }
                            
                            await checkProductAvailabilityOnTheSelectedDate();
                        }
                    } else {
                        await fetchRentalTimeSlots(newVal);
                    }
                } else {
                    startDate.value = null;
                    endDate.value = null;
                }
            });

            // Appointment related watchers
            watch(appointmentDate, (newVal) => {
            if (!newVal) return;
            fetchAppointmentTimeSlots();
            });

            // Other watchers
            watch(blackoutDates, (newVal) => {
            if (newVal?.length > 0) {
                disabledDates.value = newVal.map(date => new Date(date));
            }
            }, { immediate: true });

            watch(bookedDates, (newVal) => {
            if (newVal?.length > 0) {
                disabledDates.value.push(...newVal);
            }
            });

           //   check the variant change
            const setupVariantWatcher = () => {
                let lastVariantId = null;

                const updateVariant = (newId) => {
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

                // checkUrlVariant(); // initial run

                // 2. Watch hidden input[name="id"]
                const input = document.querySelector('form[action="/cart/add"] [name="id"]');
                if (input) {
                    const observer = new MutationObserver(() =>
                        updateVariant(input.value)
                    );
                    observer.observe(input, { attributes: true, attributeFilter: ["value"] });
                }
            };
            // ==========================
            // LIFECYCLE
            // ==========================
            onMounted(() => {
                initializeBooking();
                setupVariantWatcher();
            });

            // ==========================
            // RETURN (exposing to template)
            // ==========================
            return {
            // data
            quantitySelected,
            checkingAvailability,
            fetchingAvailableSlots,
            productId,
            variantId,
            baseURL,
            addingToCart,
            productTypeCheck,
            isBookingType,
            bookingRule,
            ruleId,
            leadTime,
            cutoffDays,
            bookedDates,
            disabledDates,
            selectedRentalDate,
            isSelectedRentalDateValid,
            rentalTime,
            availableAndBookedRentalTimeSlots,
            startDate,
            endDate,
            appointmentDate,
            appointmentTime,
            availableAndBookedAppointmentTimeSlots,
            daysOfAWeek,
            errorMessage,
            isHourlyDuration,

            // methods
            addToCartDailyRentalProduct,
            addToCartHourlyRentalProduct,
            setRentalTime,
            checkAvailability,
            checkProductAvailabilityOnTheSelectedDate,
            checkRentalSlotAvailability,
            addToCartAppointmentProduct,
            setAppointmentTime,
            checkAppointmentSlotAvailability,
            fetchAvailableDates,
            formatDate,
            updateSelectedQuantity,
            decrementQuantity,
            incrementQuantity,
            fetchRentalTimeSlots,
            fetchAppointmentTimeSlots,
            fetchAvailableAndBookedTimeSlots,
            handleAddToCart,
            initializeBooking,

            // computed
            bookingTitle,
            cutoffDate,
            futureDays,
            markers,
            rangeConfig,
            duration,
            durationFormat,
            numberofDaysSelected,
            availableRentalTimeSlots,
            bookedRentalTimeSlots,
            availableAppointmentTimeSlots,
            bookedAppointmentTimeSlots,
            bookingType,
            blackoutDates,
            closedDays,
            isAddToCartBtnDisabled
            };
        },
        // Keep the same delimiters
        delimiters: ['%%', '%%']
        });

        // ==========================
        // PrimeVue Configuration
        // ==========================
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

    app.config.errorHandler = (err, instance, info) => {
        console.group('Vue Global Error Handler');
        console.error('Error:', err);
        console.error('Info:', info);
        if (instance) {
          console.error('Component Name:', instance.$options.name);
          console.error('Props:', instance.$props);
        }
        console.groupEnd();
      };

    app.component('p-button', PrimeVue.Button);
    app.component('p-dialog', PrimeVue.Dialog);
    app.component('p-inputtext', PrimeVue.InputText);
    app.component('p-textarea', PrimeVue.Textarea);
    app.component('p-card', PrimeVue.Card);

    app.mount('#st-booking-and-rental');
}
(function() {
        'use strict';
        
        const extraDeps = [
            'https://unpkg.com/@vuepic/vue-datepicker@10.0.0',
            'https://cdn.jsdelivr.net/npm/date-fns@3.6.0/cdn.min.js',
            'https://unpkg.com/axios/dist/axios.min.js'
        ];
        
        if (window.ST_Resources) {
            ST_Resources.loadDependencies(BookingRentalAndAppointment, extraDeps);
        } else {
            const interval = setInterval(() => {
                if (window.ST_Resources) {
                    clearInterval(interval);
                    ST_Resources.loadDependencies(BookingRentalAndAppointment, extraDeps);
                }
            }, 50);
        }
})();