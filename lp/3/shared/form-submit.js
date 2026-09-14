(function () {
  function setStatus(form, type, message) {
    var status = form.querySelector("[data-form-status]");
    if (!status) {
      return;
    }

    status.textContent = message;
    status.dataset.status = type;
  }

  function toUrlEncoded(form) {
    var data = new FormData(form);
    data.set("送信ページ", window.location.href);
    return new URLSearchParams(data).toString();
  }

  async function submitForm(form) {
    var submit = form.querySelector('[type="submit"]');
    var originalText = submit ? submit.textContent : "";

    if (submit) {
      submit.disabled = true;
      submit.textContent = "送信中...";
    }

    setStatus(form, "pending", "送信しています。しばらくお待ちください。");

    try {
      var response = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: toUrlEncoded(form),
      });

      if (!response.ok) {
        throw new Error("送信に失敗しました。");
      }

      form.reset();
      form.querySelectorAll(".sel").forEach(function (select) {
        select.classList.remove("is-filled");
      });
      setStatus(form, "success", "送信しました。完了ページへ移動します。");
      try {
        sessionStorage.setItem("leaseback_submission_pending", "1");
      } catch (_) {}
      window.location.href = form.dataset.successUrl || "thanks.html";
    } catch (error) {
      setStatus(form, "error", error.message || "送信できませんでした。時間をおいて再度お試しください。");
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = originalText;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-contact-form]").forEach(function (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();

        if (!form.reportValidity()) {
          return;
        }

        submitForm(form);
      });
    });
  });
})();
