window.ST_Resources = {
    loadScript: function(dep) {
        return new Promise((resolve, reject) => {
            const { src, global } = dep;

            const checkGlobal = () => {
                if (global) {
                    const parts = global.split('.');
                    let current = window;
                    for (const part of parts) {
                        current = current?.[part];
                        if (!current) return false;
                    }
                    return true;
                }
                return !!document.querySelector(`script[src="${src}"]`);
            };

            if (checkGlobal()) {
                resolve(src);
                return;
            }

            const existingScript = document.querySelector(`script[src="${src}"]`);
            if (existingScript) {
                const interval = setInterval(() => {
                    if (checkGlobal()) {
                        clearInterval(interval);
                        resolve(src);
                    }
                }, 100);
                return;
            }

            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.onload = () => {
                if (checkGlobal()) {
                    resolve(src);
                } else {
                    const interval = setInterval(() => {
                        if (checkGlobal()) {
                            clearInterval(interval);
                            resolve(src);
                        }
                    }, 50);
                }
            };
            s.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(s);
        });
    },

    loadDependencies: function(callback, extraDeps = []) {
        console.log("Dependency start loading");
        
        const coreDeps = [
            { src: 'https://unpkg.com/vue@3.5.1/dist/vue.global.js', global: 'Vue' },
            { src: 'https://unpkg.com/primevue/umd/primevue.min.js', global: 'PrimeVue' },
            { src: 'https://unpkg.com/vue-i18n@9/dist/vue-i18n.global.prod.js', global: 'VueI18n' },
            { src: 'https://unpkg.com/@primevue/themes/umd/aura.min.js', global: 'PrimeVue.Themes.Aura' }
        ];

        const allDeps = [...coreDeps, ...extraDeps];

        Promise.all(allDeps.map(dep => this.loadScript(dep)))
            .then(() => {
                const finalCheck = setInterval(() => {
                    const allLoaded = allDeps.every(dep => {
                        const { global } = dep;
                        if (!global) return true;
                        
                        const parts = global.split('.');
                        let current = window;
                        for (const part of parts) {
                            current = current?.[part];
                            if (!current) return false;
                        }
                        return true;
                    });

                    if (allLoaded) {
                        clearInterval(finalCheck);
                        console.log("Dependency stop loading");
                        callback();
                    }
                }, 50);
            })
            .catch(err => {
                console.error('Dependency load error:', err);
            });
    },

    // checkExtraDependencyLoaded: function(dep) {
    //     const { src, global } = dep;

    //     if (global) {
    //         const parts = global.split('.');
    //         let current = window;
    //         for (const part of parts) {
    //             current = current?.[part];
    //             if (!current) return false;
    //         }
    //         return true;
    //     }
    //     return !!document.querySelector(`script[src="${src}"]`);
    // }
};
