(() => {
  "use strict";

  const SELECTORS = {
    caseAutoplayToggle: ".case-autoplay-toggle",
    caseCarousel: "#case-carousel",
    caseDots: ".case-carousel-dots button",
    faqItem: ".faq details",
    prefectureMenu: ".prefecture-menu",
    prefectureOption: ".prefecture-option",
    prefecturePicker: ".prefecture-picker",
    prefectureSelect: 'select[name="都道府県"]',
    prefectureTrigger: ".prefecture-trigger",
  };

  const setPickerOpen = (picker, isOpen) => {
    const trigger = picker.querySelector(SELECTORS.prefectureTrigger);
    const menu = picker.querySelector(SELECTORS.prefectureMenu);

    picker.classList.toggle("is-open", isOpen);
    trigger?.setAttribute("aria-expanded", String(isOpen));
    if (menu) menu.hidden = !isOpen;
  };

  const closePrefecturePickers = (except = null) => {
    document
      .querySelectorAll(`${SELECTORS.prefecturePicker}.is-open`)
      .forEach((picker) => {
        if (picker !== except) setPickerOpen(picker, false);
      });
  };

  const initFaqAccordion = () => {
    const items = Array.from(document.querySelectorAll(SELECTORS.faqItem));

    items.forEach((item) => {
      item.addEventListener("toggle", () => {
        if (!item.open) return;
        items.forEach((other) => {
          if (other !== item) other.open = false;
        });
      });
    });
  };

  const initPrefecturePicker = (select, index) => {
    if (select.hasAttribute("data-native-prefecture")) return;
    if (select.dataset.enhanced === "true") return;

    select.dataset.enhanced = "true";
    select.classList.add("prefecture-native");

    const picker = document.createElement("div");
    picker.className = "prefecture-picker";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "prefecture-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", `prefecture-menu-${index}`);
    trigger.textContent = select.options[select.selectedIndex].text;

    const menu = document.createElement("div");
    menu.id = `prefecture-menu-${index}`;
    menu.className = "prefecture-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;

    const getOptions = () =>
      Array.from(menu.querySelectorAll(SELECTORS.prefectureOption));

    const focusOption = (targetIndex) => {
      const options = getOptions();
      if (!options.length) return;

      const normalizedIndex = (targetIndex + options.length) % options.length;
      options[normalizedIndex].focus();
    };

    const toggleMenu = (forceOpen) => {
      const isOpen = forceOpen ?? !picker.classList.contains("is-open");
      closePrefecturePickers(isOpen ? picker : null);
      setPickerOpen(picker, isOpen);
    };

    Array.from(select.options)
      .slice(1)
      .forEach((option) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "prefecture-option";
        item.dataset.value = option.value;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(option.selected));
        item.textContent = option.text;

        item.addEventListener("click", () => {
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          picker.classList.remove("is-invalid");
          setPickerOpen(picker, false);
          trigger.focus();
        });

        menu.appendChild(item);
      });

    select.addEventListener("change", () => {
      const selectedOption = select.options[select.selectedIndex];
      trigger.textContent = selectedOption.text;

      getOptions().forEach((item) => {
        item.setAttribute(
          "aria-selected",
          String(item.dataset.value === select.value),
        );
      });
    });

    trigger.addEventListener("click", () => toggleMenu());
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!picker.classList.contains("is-open")) toggleMenu(true);
        requestAnimationFrame(() =>
          focusOption(event.key === "ArrowDown" ? 0 : -1),
        );
      } else if (
        event.key === "Escape" &&
        picker.classList.contains("is-open")
      ) {
        event.preventDefault();
        toggleMenu(false);
      }
    });

    menu.addEventListener("keydown", (event) => {
      const options = getOptions();
      const currentIndex = options.indexOf(document.activeElement);
      const keyActions = {
        ArrowDown: () => focusOption(currentIndex + 1),
        ArrowUp: () => focusOption(currentIndex - 1),
        End: () => focusOption(-1),
        Home: () => focusOption(0),
      };

      if (keyActions[event.key]) {
        event.preventDefault();
        keyActions[event.key]();
      } else if (event.key === "Escape") {
        event.preventDefault();
        toggleMenu(false);
        trigger.focus();
      }
    });

    select.addEventListener("invalid", (event) => {
      event.preventDefault();
      closePrefecturePickers(picker);
      picker.classList.add("is-invalid");
      setPickerOpen(picker, true);
      trigger.focus();
    });

    picker.append(trigger, menu);
    select.insertAdjacentElement("afterend", picker);
  };

  const initPrefecturePickers = () => {
    document
      .querySelectorAll(SELECTORS.prefectureSelect)
      .forEach(initPrefecturePicker);

    document.addEventListener("click", (event) => {
      if (!event.target.closest(SELECTORS.prefecturePicker))
        closePrefecturePickers();
    });
  };

  const initCaseCarousel = () => {
    const carousel = document.querySelector(SELECTORS.caseCarousel);
    const toggle = document.querySelector(SELECTORS.caseAutoplayToggle);
    if (!carousel || !toggle) return;

    const cards = Array.from(carousel.querySelectorAll("article"));
    const dots = Array.from(document.querySelectorAll(SELECTORS.caseDots));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktopLayout = window.matchMedia("(min-width: 900px)");
    const AUTOPLAY_DELAY = 4500;
    const INTERACTION_PAUSE = 8000;
    let activeIndex = 0;
    let autoplayTimer = null;
    let interactionTimer = null;
    let isInView = false;
    let isPointerOver = false;
    let isFocusWithin = false;
    let isUserPaused = false;
    let scrollFrame = null;

    const setActiveIndex = (index) => {
      activeIndex = index;
      cards.forEach((card, cardIndex) => {
        card.classList.toggle("is-active", cardIndex === index);
      });
      dots.forEach((dot, dotIndex) => {
        if (dotIndex === index) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
    };

    const getCardScrollLeft = (card) =>
      Math.min(
        card.offsetLeft - carousel.offsetLeft,
        carousel.scrollWidth - carousel.clientWidth,
      );

    const goToCard = (index, behavior = "smooth") => {
      const normalizedIndex = (index + cards.length) % cards.length;
      setActiveIndex(normalizedIndex);
      if (desktopLayout.matches) return;
      carousel.scrollTo({
        left: getCardScrollLeft(cards[normalizedIndex]),
        behavior,
      });
    };

    const stopAutoplay = () => {
      window.clearInterval(autoplayTimer);
      autoplayTimer = null;
    };

    const canAutoplay = () =>
      isInView &&
      !document.hidden &&
      !reducedMotion.matches &&
      !isPointerOver &&
      !isFocusWithin &&
      !isUserPaused;

    const startAutoplay = () => {
      stopAutoplay();
      if (!canAutoplay()) return;
      autoplayTimer = window.setInterval(
        () => goToCard(activeIndex + 1),
        AUTOPLAY_DELAY,
      );
    };

    const updateToggle = () => {
      toggle.hidden = reducedMotion.matches;
      toggle.setAttribute("aria-pressed", String(isUserPaused));
      toggle.setAttribute(
        "aria-label",
        isUserPaused ? "事例の自動再生を再開" : "事例の自動再生を停止",
      );
    };

    const pauseAfterInteraction = () => {
      stopAutoplay();
      window.clearTimeout(interactionTimer);
      interactionTimer = window.setTimeout(startAutoplay, INTERACTION_PAUSE);
    };

    dots.forEach((dot, index) => {
      dot.addEventListener("click", () => {
        goToCard(index);
        pauseAfterInteraction();
      });
    });

    toggle.addEventListener("click", () => {
      isUserPaused = !isUserPaused;
      updateToggle();
      if (isUserPaused) stopAutoplay();
      else startAutoplay();
    });

    carousel.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      isPointerOver = true;
      stopAutoplay();
    });
    carousel.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "mouse") return;
      isPointerOver = false;
      startAutoplay();
    });
    carousel.addEventListener("focusin", () => {
      isFocusWithin = true;
      stopAutoplay();
    });
    carousel.addEventListener("focusout", (event) => {
      if (carousel.contains(event.relatedTarget)) return;
      isFocusWithin = false;
      startAutoplay();
    });
    carousel.addEventListener(
      "touchstart",
      () => pauseAfterInteraction(),
      { passive: true },
    );
    carousel.addEventListener(
      "scroll",
      () => {
        if (desktopLayout.matches) return;
        window.cancelAnimationFrame(scrollFrame);
        scrollFrame = window.requestAnimationFrame(() => {
          const closestIndex = cards.reduce((closest, card, index) => {
            const currentDistance = Math.abs(
              carousel.scrollLeft - getCardScrollLeft(card),
            );
            const closestDistance = Math.abs(
              carousel.scrollLeft - getCardScrollLeft(cards[closest]),
            );
            return currentDistance < closestDistance ? index : closest;
          }, 0);
          setActiveIndex(closestIndex);
        });
      },
      { passive: true },
    );

    const observer = new IntersectionObserver(
      ([entry]) => {
        isInView = entry.isIntersecting;
        if (isInView) startAutoplay();
        else stopAutoplay();
      },
      { threshold: 0.55 },
    );
    observer.observe(carousel);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopAutoplay();
      else startAutoplay();
    });
    reducedMotion.addEventListener("change", () => {
      updateToggle();
      if (reducedMotion.matches) stopAutoplay();
      else startAutoplay();
    });
    desktopLayout.addEventListener("change", () => {
      goToCard(activeIndex, "auto");
    });

    setActiveIndex(0);
    updateToggle();
  };

  const initFloatingCta = () => {
    const shell = document.querySelector(".floating-cta-shell");
    const closing = document.querySelector("#final-guide");
    if (!shell || !closing || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        shell.classList.toggle("is-suppressed", entry.isIntersecting);
      },
      { threshold: 0.04 },
    );
    observer.observe(closing);
  };

  initFaqAccordion();
  initPrefecturePickers();
  initCaseCarousel();
  initFloatingCta();
})();
