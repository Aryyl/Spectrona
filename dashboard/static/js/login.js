/**
 * login.js
 * ========
 * Controller for Jeev One Clinical Gateway & Telemetry Node Authentication.
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  initRoleTabs();
  initDemoChips();
  initPasswordToggle();
  initLoginForm();
});

// Demo accounts database for clinical access and patient monitoring
const DEMO_ACCOUNTS = {
  clinician: {
    username: "dr.admin@jeevone.health",
    password: "clinical_access",
    role: "Clinician / Physician",
    userId: "user_1",
    displayName: "Dr. Admin (Cardiology)"
  },
  aryyaman: {
    username: "aryyaman@jeevone.local",
    password: "patient_access",
    role: "Patient (Subject 01)",
    userId: "user_1",
    displayName: "Aryyaman"
  },
  hirok: {
    username: "hirok@jeevone.local",
    password: "patient_access",
    role: "Patient (Subject 02)",
    userId: "user_2",
    displayName: "Hirok"
  }
};

let currentRole = "clinician";

// ── Role Tabs (Clinician vs Patient) ──────────────────────────────────────────
function initRoleTabs() {
  const tabs = document.querySelectorAll(".role-tab-btn");
  const usernameInput = document.getElementById("login-username");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentRole = tab.getAttribute("data-role");

      if (usernameInput) {
        if (currentRole === "clinician") {
          usernameInput.placeholder = "clinician@jeevone.health or ID";
        } else {
          usernameInput.placeholder = "patient@jeevone.local or Patient ID";
        }
      }
    });
  });
}

// ── Demo Chips (One-Click Auto-Fill) ──────────────────────────────────────────
function initDemoChips() {
  const chips = document.querySelectorAll(".demo-chip-btn");
  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const alertBox = document.getElementById("auth-alert");

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      const accountKey = chip.getAttribute("data-account");
      const account = DEMO_ACCOUNTS[accountKey];
      if (!account) return;

      // Fill inputs
      if (usernameInput) usernameInput.value = account.username;
      if (passwordInput) passwordInput.value = account.password;

      // Set matching role tab
      const targetRole = accountKey === "clinician" ? "clinician" : "patient";
      const targetTab = document.querySelector(`.role-tab-btn[data-role="${targetRole}"]`);
      if (targetTab) targetTab.click();

      // Clear any prior alert
      if (alertBox) {
        alertBox.className = "auth-alert-box";
        alertBox.textContent = "";
      }

      // Add a subtle flash effect to inputs to show they were filled
      if (usernameInput) {
        usernameInput.style.borderColor = "var(--accent-green)";
        setTimeout(() => usernameInput.style.borderColor = "", 400);
      }
      if (passwordInput) {
        passwordInput.style.borderColor = "var(--accent-green)";
        setTimeout(() => passwordInput.style.borderColor = "", 400);
      }
    });
  });
}

// ── Password Visibility Toggle ────────────────────────────────────────────────
function initPasswordToggle() {
  const toggleBtn = document.getElementById("btn-toggle-pwd");
  const passwordInput = document.getElementById("login-password");
  const iconEyeOpen = document.getElementById("icon-eye-open");
  const iconEyeClosed = document.getElementById("icon-eye-closed");

  if (!toggleBtn || !passwordInput) return;

  toggleBtn.addEventListener("click", () => {
    const isPassword = passwordInput.getAttribute("type") === "password";
    passwordInput.setAttribute("type", isPassword ? "text" : "password");

    if (iconEyeOpen && iconEyeClosed) {
      iconEyeOpen.style.display = isPassword ? "none" : "block";
      iconEyeClosed.style.display = isPassword ? "block" : "none";
    }
  });
}

// ── Login Form Controller ─────────────────────────────────────────────────────
function initLoginForm() {
  const form = document.getElementById("login-form");
  const submitBtn = document.getElementById("btn-submit-login");
  const alertBox = document.getElementById("auth-alert");
  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const rememberCheckbox = document.getElementById("remember-device");

  if (!form || !submitBtn) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const username = (usernameInput?.value || "").trim();
    const password = (passwordInput?.value || "").trim();

    if (!username || !password) {
      showAlert("Please enter both username/ID and password.", "error");
      return;
    }

    // Set button to loading state
    submitBtn.classList.add("loading");
    if (alertBox) alertBox.className = "auth-alert-box";

    // Simulate authenticating against Edge Node Gateway
    setTimeout(() => {
      // Determine user identity
      let matchedUser = "user_1";
      let displayName = "Aryyaman";
      let roleName = "Subject 01";

      if (username.toLowerCase().includes("hirok") || username.toLowerCase().includes("user_2")) {
        matchedUser = "user_2";
        displayName = "Hirok";
        roleName = "Subject 02";
      } else if (username.toLowerCase().includes("dr") || username.toLowerCase().includes("admin") || currentRole === "clinician") {
        matchedUser = "user_1";
        displayName = "Dr. Admin";
        roleName = "Attending Physician";
      }

      const sessionData = {
        authenticated: true,
        username: username,
        displayName: displayName,
        role: roleName,
        userId: matchedUser,
        loginTime: new Date().toISOString(),
        node: "ESP32-RPI5-EDGE-01"
      };

      // Store in session
      sessionStorage.setItem("jeev_one_auth", JSON.stringify(sessionData));
      sessionStorage.setItem("jeev_one_user_id", matchedUser);

      // If "Remember this device" is checked, store in localStorage
      if (rememberCheckbox && rememberCheckbox.checked) {
        localStorage.setItem("jeev_one_auth", JSON.stringify(sessionData));
        localStorage.setItem("jeev_one_user_id", matchedUser);
      }

      showAlert(`Authentication successful. Connecting to Edge Node Telemetry for ${displayName}...`, "success");

      // Smooth transition to dashboard
      setTimeout(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const redirectParam = urlParams.get("redirect") || "/dashboard";
        window.location.href = redirectParam;
      }, 650);
    }, 700);
  });

  function showAlert(msg, type) {
    if (!alertBox) return;
    alertBox.className = `auth-alert-box ${type}`;
    alertBox.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
        ${type === "error" 
          ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' 
          : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'}
      </svg>
      <span>${msg}</span>
    `;
    submitBtn.classList.remove("loading");
  }
}
