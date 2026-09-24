/**
 * FODQ Interactive Experience — Pure Vanilla ES6
 * Zero external dependencies. GitHub Pages compatible.
 */

document.addEventListener('DOMContentLoaded', () => {

  // --- 1. DINER JOURNEY DATA & CONTROLLER ---
  const journeySteps = [
    {
      num: '01',
      phase: 'GUEST INGRESS',
      title: 'Scan Table QR',
      desc: 'Diners arrive at the physical table and scan the dynamic table QR code using their standard smartphone camera. The cryptographic token validates physical proximity and instantly binds the diner to an active table session.',
      icon: '../../assets/qr-code-scan.svg',
      status: 'Table Status: AVAILABLE ➔ OCCUPIED',
      highlights: [
        'Proves physical table presence cryptographically',
        'Zero app store download or install friction',
        'Binds device to table session without tracking cookies'
      ]
    },
    {
      num: '02',
      phase: 'EXPLORATION',
      title: 'Discover Menu',
      desc: 'The lightweight PWA renders the full digital catalog in under 2 seconds. Guests browse categorized dishes with high-resolution photography, dietary icons (Veg / Non-Veg), and transparent allergen notices.',
      icon: '../../assets/food-menu.svg',
      status: 'Table Status: OCCUPIED (Browsing)',
      highlights: [
        'High-resolution visual food photography',
        'Instant dietary filters and keyword search',
        'Sub-second category navigation powered by cached catalog'
      ]
    },
    {
      num: '03',
      phase: 'SELECTION',
      title: 'Customize Modifiers',
      desc: 'Guests tailor dishes to their exact preferences: selecting portion sizes, configuring spice levels, adding extra toppings, or inputting special dietary instructions directly for the line cook.',
      icon: '../../assets/fork-plate.svg',
      status: 'Table Status: OCCUPIED (Carting)',
      highlights: [
        'Multi-level modifier groups (Required & Optional)',
        'Dynamic subtotal calculation with modifier price deltas',
        'Direct chef notes captured per individual line item'
      ]
    },
    {
      num: '04',
      phase: 'AUTHORITY',
      title: 'Submit Order',
      desc: 'The table cart is submitted to the backend. The API strictly recalculates every item subtotal and tax calculation server-side, verifying live ingredient availability and preventing client price tampering.',
      icon: '../../assets/order-food.svg',
      status: 'Table Status: ORDERED (Validated)',
      highlights: [
        'Strict server-side price validation prevents tampering',
        'Live 86-ed inventory check prevents out-of-stock orders',
        'Atomically recorded in PostgreSQL source of truth'
      ]
    },
    {
      num: '05',
      phase: 'KDS INGESTION',
      title: 'Kitchen Receives',
      desc: 'The verified order is broadcast in sub-50 milliseconds across Redis pub/sub channels directly to Kitchen Display System (KDS) tablets positioned at fry, grill, and beverage prep stations.',
      icon: '../../assets/kitchen.svg',
      status: 'Table Status: ORDERED (KDS Queued)',
      highlights: [
        'Sub-50ms event distribution replaces paper order tickets',
        'Intelligent multi-station routing (Kitchen, Bar, Dessert)',
        'Audible chime and visual ticket flash alert line cooks'
      ]
    },
    {
      num: '06',
      phase: 'PREPARATION',
      title: 'Order Prepared & Served',
      desc: 'Line cooks interactively progress ticket stages (ACCEPTED ➔ PREPARING ➔ READY ➔ SERVED). Elapsed timers highlight ticket delays, while diners observe real-time preparation updates on their phones.',
      icon: '../../assets/approved.svg',
      status: 'Table Status: ORDERED (Cooking / Served)',
      highlights: [
        'Touch progression: Accepted ➔ Preparing ➔ Ready ➔ Served',
        'Color-coded elapsed timers prevent peak-hour bottlenecks',
        'Diners view live preparation status updates via WebSocket'
      ]
    },
    {
      num: '07',
      phase: 'INVOICING',
      title: 'Request Bill',
      desc: 'Diners request the check directly from their phone or summon the floor cashier. The fiscal billing engine computes itemized subtotals, statutory GST/VAT rates, and service fees.',
      icon: '../../assets/receipt.svg',
      status: 'Table Status: BILLING (Invoice Active)',
      highlights: [
        'Automated statutory tax (GST/VAT) computation',
        'Flexible split-bill review across table companions',
        'Real-time synchronization with cashier desk POS'
      ]
    },
    {
      num: '08',
      phase: 'SETTLEMENT',
      title: 'Digital Payment',
      desc: 'Guests complete payment seamlessly via integrated Razorpay gateway (UPI Intent, Google Pay, PhonePe, Cards, NetBanking) or cash. Cryptographically signed webhooks capture and verify payment.',
      icon: '../../assets/razorpay.svg',
      status: 'Table Status: BILLING (Captured)',
      highlights: [
        'Seamless UPI Intent and card payment gateway checkout',
        'Cryptographic HMAC SHA-256 webhook signature validation',
        'Automatic state transition of bill ledger to PAID'
      ]
    },
    {
      num: '09',
      phase: 'COMPLETION',
      title: 'Table Reset & Receipt',
      desc: 'A paperless digital receipt is instantly rendered on the diner’s device. The dining session closes cleanly in the database, resetting the table to AVAILABLE for the next arriving party.',
      icon: '../../assets/resturant-65.png',
      status: 'Table Status: AVAILABLE (Ready for Diners)',
      highlights: [
        'Eco-friendly digital PDF receipt with full tax itemization',
        'DineSession closed and cleared from floor management map',
        'Table immediately resets to AVAILABLE for the next party'
      ]
    }
  ];

  let currentStepIdx = 0;
  const journeyNav = document.getElementById('journeyNav');
  const stageStepTag = document.getElementById('stageStepTag');
  const stagePhaseBadge = document.getElementById('stagePhaseBadge');
  const stageTitle = document.getElementById('stageTitle');
  const stageDesc = document.getElementById('stageDesc');
  const stageHighlights = document.getElementById('stageHighlights');
  const stageIcon = document.getElementById('stageIcon');
  const stageStatusText = document.getElementById('stageStatusText');
  const btnPrevStep = document.getElementById('btnPrevStep');
  const btnNextStep = document.getElementById('btnNextStep');

  // Render Journey Nav Buttons
  journeySteps.forEach((step, idx) => {
    const btn = document.createElement('button');
    btn.className = `journey-step-btn ${idx === 0 ? 'active' : ''}`;
    btn.innerHTML = `
      <span class="step-num-badge">${step.num}</span>
      <span>${step.title}</span>
    `;
    btn.addEventListener('click', () => {
      setJourneyStep(idx);
    });
    journeyNav.appendChild(btn);
  });

  function setJourneyStep(idx) {
    currentStepIdx = idx;
    const step = journeySteps[idx];

    // Update nav active states
    const btns = journeyNav.querySelectorAll('.journey-step-btn');
    btns.forEach((b, i) => {
      b.classList.toggle('active', i === idx);
    });

    // Update Stage Card Info
    stageStepTag.textContent = `STEP ${step.num}`;
    stagePhaseBadge.textContent = step.phase;
    stageTitle.textContent = step.title;
    stageDesc.textContent = step.desc;
    stageIcon.src = step.icon;
    stageStatusText.textContent = step.status;

    // Highlights
    stageHighlights.innerHTML = step.highlights
      .map(h => `<div class="highlight-row"><span class="highlight-check">✓</span><span>${h}</span></div>`)
      .join('');

    // Nav buttons
    btnPrevStep.disabled = idx === 0;
    btnNextStep.innerHTML = idx === journeySteps.length - 1 
      ? '<span>Restart Journey</span> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>'
      : '<span>Next Transition</span> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

    // Scroll active nav item into view on mobile
    btns[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  btnPrevStep.addEventListener('click', () => {
    if (currentStepIdx > 0) setJourneyStep(currentStepIdx - 1);
  });

  btnNextStep.addEventListener('click', () => {
    if (currentStepIdx < journeySteps.length - 1) {
      setJourneyStep(currentStepIdx + 1);
    } else {
      setJourneyStep(0);
    }
  });

  // Initial load
  setJourneyStep(0);


  // --- 2. INTERACTIVE FEATURE EXPLORER ---
  const featuresData = [
    {
      title: 'QR-First Mobile Ordering',
      icon: '../../assets/qr-code-scan.svg',
      brief: 'Zero-install mobile web application designed for instant table ingress, high-res photography, and custom modifiers.',
      details: [
        'Lightweight Next.js PWA loads in under 2 seconds on mobile data',
        'Multi-guest synchronous table ordering and shared cart review',
        'Comprehensive dietary filters (Veg / Non-Veg / Vegan / Halal)',
        'Zero tracking cookies or app installation required from diner'
      ],
      tag: 'GUEST EXPERIENCE'
    },
    {
      title: 'Kitchen Display System (KDS)',
      icon: '../../assets/kitchen.svg',
      brief: 'Digital line-cook tablet board replacing thermal ticket printers with sub-50ms realtime order routing.',
      details: [
        'Automatic routing of tickets to dedicated line prep stations',
        'Interactive stage touch progression: Accepted ➔ Preparing ➔ Ready',
        'Color-coded elapsed timers prevent peak-hour dining bottlenecks',
        'Eliminates lost tickets, paper costs, and handwritten order errors'
      ],
      tag: 'KITCHEN OPS'
    },
    {
      title: 'Authoritative Digital Billing',
      icon: '../../assets/receipt.svg',
      brief: 'Fiscal ledger guaranteeing mathematical price accuracy, statutory tax calculation, and instant payment settlement.',
      details: [
        'Server-side recalculation protects against client price tampering',
        'Support for statutory GST/VAT itemization and service charges',
        'Flexible cashier settlement: Cash drawer, UPI Intent, or Credit Cards',
        'Instant digital PDF invoice generation with QR verification'
      ],
      tag: 'FINANCIAL ACCURACY'
    },
    {
      title: 'Restaurant Governance & RBAC',
      icon: '../../assets/approved.svg',
      brief: 'Comprehensive management suite for venue identity, operating hours, branding, and role-based staff permissions.',
      details: [
        'Permanent FODQ identity and venue code isolation',
        'Granular RBAC roles: Owner, Manager, Chef, Cashier, and Waiter',
        'Multi-device session revocation and trusted device controls',
        'Append-only immutable audit logging for all critical operations'
      ],
      tag: 'SECURITY & CONTROL'
    },
    {
      title: 'Dynamic Floor & Table Provisioning',
      icon: '../../assets/dine-in-rounded.svg',
      brief: 'Interactive table layout management with cryptographic QR token provisioning and live occupancy synchronization.',
      details: [
        'Provision tables with individual capacities and section designations',
        'One-click export of print-ready high-density QR stickers and PDFs',
        'Live floor map status: Available, Occupied, Ordered, and Billing',
        'Cryptographic QR secret rotation invalidates outdated physical prints'
      ],
      tag: 'FLOOR MANAGEMENT'
    },
    {
      title: 'Real-Time Revenue Analytics',
      icon: '../../assets/resturant-65.png',
      brief: 'Actionable business intelligence tracking live sales turnover, dish velocity, average ticket size, and peak rush hours.',
      details: [
        'Daily and weekly gross sales tracking with tax breakdowns',
        'Top-selling dish velocity rankings for menu optimization',
        'Table turnover time analysis to identify dining bottlenecks',
        'Direct export to accounting ledgers with zero manual reconciliation'
      ],
      tag: 'BUSINESS INTELLIGENCE'
    }
  ];

  const featuresGrid = document.getElementById('featuresGrid');
  featuresData.forEach((feat, idx) => {
    const card = document.createElement('div');
    card.className = 'feature-card';
    card.innerHTML = `
      <div class="feature-top">
        <div class="feature-icon-box">
          <img src="${feat.icon}" class="feature-icon" alt="${feat.title}" />
        </div>
        <div class="feature-expand-indicator">↓</div>
      </div>
      <span class="feature-pill-badge">${feat.tag}</span>
      <h3 class="feature-title" style="margin-top: 10px;">${feat.title}</h3>
      <p class="feature-brief">${feat.brief}</p>
      <div class="feature-expanded-content">
        <ul class="feature-detail-list">
          ${feat.details.map(d => `<li class="feature-detail-item">${d}</li>`).join('')}
        </ul>
      </div>
    `;

    card.addEventListener('click', () => {
      const isExpanded = card.classList.contains('expanded');
      // Toggle current
      card.classList.toggle('expanded', !isExpanded);
    });

    featuresGrid.appendChild(card);
  });


  // --- 3. PRODUCT PREVIEW LIGHTBOX ---
  const lightboxModal = document.getElementById('lightboxModal');
  const lightboxBackdrop = document.getElementById('lightboxBackdrop');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');

  document.querySelectorAll('.gallery-card').forEach(card => {
    card.addEventListener('click', () => {
      const src = card.getAttribute('data-img');
      const title = card.getAttribute('data-title');
      lightboxImg.src = src;
      lightboxCaption.textContent = title;
      lightboxModal.classList.add('active');
      lightboxModal.setAttribute('aria-hidden', 'false');
    });
  });

  function closeLightbox() {
    lightboxModal.classList.remove('active');
    lightboxModal.setAttribute('aria-hidden', 'true');
    lightboxImg.src = '';
  }

  lightboxClose.addEventListener('click', closeLightbox);
  lightboxBackdrop.addEventListener('click', closeLightbox);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightboxModal.classList.contains('active')) {
      closeLightbox();
    }
  });


  // --- 4. INTERACTIVE TECH STACK ---
  const techData = [
    {
      name: 'Next.js 16',
      icon: '../../assets/next-js.svg',
      role: 'Customer Web (PWA) & Admin',
      desc: 'Next.js powers the high-performance customer progressive web application and owner dashboard. It delivers sub-second First Contentful Paint (FCP) on mobile browsers with zero app installation.',
      highlights: ['App Router architecture', 'Sub-second mobile loading', 'Responsive tablet KDS UI', 'Zero-install diner access']
    },
    {
      name: 'FastAPI ASGI',
      icon: '../../assets/fastapi-1.svg',
      role: 'Core Business & Security Authority',
      desc: 'FastAPI handles all authoritative business validation, order processing, and cryptographic token verification with asynchronous Python coroutines.',
      highlights: ['Microsecond endpoint latency', 'Pydantic v2 strict typing', 'Server-authoritative pricing', 'OpenAPI documentation']
    },
    {
      name: 'Python 3.12',
      icon: '../../assets/python-5.svg',
      role: 'Backend Runtime',
      desc: 'Provides modern asynchronous language features, robust cryptographic hashing libraries, and enterprise reliability across backend microservices.',
      highlights: ['Async I/O non-blocking concurrency', 'Strict type hinting & static analysis', 'High computational throughput']
    },
    {
      name: 'Flutter Mobile',
      icon: '../../assets/flutter.svg',
      role: 'Partner Mobile & Tablet Apps',
      desc: 'Powers cross-platform native applications for restaurant owners, kitchen managers, and floor waitstaff on Android and iOS hardware.',
      highlights: ['60fps smooth hardware UI', 'Cross-platform Android & iOS codebase', 'Offline-resilient state handling']
    },
    {
      name: 'PostgreSQL 16',
      icon: '../../assets/postgresql-inc-2.svg',
      role: 'Relational Source of Truth',
      desc: 'Stores all durable business records: restaurants, tables, menus, orders, bills, and append-only audit ledgers under full ACID guarantees.',
      highlights: ['Durable multi-tenant schema isolation', 'ACID transaction boundaries', 'Indexed geospatial & token lookups']
    },
    {
      name: 'Redis 7',
      icon: '../../assets/redis.svg',
      role: 'Pub/Sub & Distributed Cache',
      desc: 'Acts as the low-latency message broker broadcasting kitchen tickets to KDS screens in sub-50ms, alongside distributed session locks and menu caching.',
      highlights: ['Sub-50ms KDS ticket broadcast', 'Distributed concurrency locks', 'Sub-millisecond menu catalog caching']
    },
    {
      name: 'Tailwind CSS',
      icon: '../../assets/tailwind-css-2.svg',
      role: 'Design System & Mobile Styling',
      desc: 'Provides utility-first, modern responsive styling across all customer and staff interfaces with tailored dark mode and food-tech aesthetics.',
      highlights: ['Zero runtime CSS overhead', 'Mobile viewport optimization', 'Dark-mode first color tokens']
    },
    {
      name: 'Razorpay Gateway',
      icon: '../../assets/razorpay.svg',
      role: 'Digital Payment Processing',
      desc: 'Seamlessly processes digital checkouts through UPI Intent, Google Pay, PhonePe, Credit/Debit cards, and netbanking with cryptographic webhook capture.',
      highlights: ['One-touch UPI Intent checkout', 'Signed HMAC webhook verification', 'Zero-latency bill status update']
    },
    {
      name: 'Docker',
      icon: '../../assets/docker.svg',
      role: 'Containerized Infrastructure',
      desc: 'Containerizes services for consistent local development and cloud production deployment with health checks and isolated networking.',
      highlights: ['Reproducible multi-container runtime', 'Isolated network boundaries', 'Standardized production deployments']
    },
    {
      name: 'Git & GitHub',
      icon: '../../assets/git-icon.svg',
      role: 'Version Control & Releases',
      desc: 'Enforces rigorous loop engineering, atomic feature branches, automated linting, and sanitized public showcase releases.',
      highlights: ['Branch protection & CI testing', 'Sanitized public showcase releases', 'Traceable commit provenance']
    }
  ];

  const techGrid = document.getElementById('techGrid');
  const techModal = document.getElementById('techModal');
  const techModalBackdrop = document.getElementById('techModalBackdrop');
  const techModalClose = document.getElementById('techModalClose');
  const techModalIcon = document.getElementById('techModalIcon');
  const techModalTitle = document.getElementById('techModalTitle');
  const techModalRole = document.getElementById('techModalRole');
  const techModalDesc = document.getElementById('techModalDesc');
  const techModalHighlights = document.getElementById('techModalHighlights');

  techData.forEach(tech => {
    const card = document.createElement('div');
    card.className = 'tech-card';
    card.innerHTML = `
      <img src="${tech.icon}" class="tech-icon" alt="${tech.name}" />
      <span class="tech-name">${tech.name}</span>
      <span class="tech-role">${tech.role}</span>
    `;

    card.addEventListener('click', () => {
      techModalIcon.src = tech.icon;
      techModalTitle.textContent = tech.name;
      techModalRole.textContent = tech.role;
      techModalDesc.textContent = tech.desc;
      techModalHighlights.innerHTML = tech.highlights
        .map(h => `<div class="tech-modal-highlight-item">${h}</div>`)
        .join('');
      techModal.classList.add('active');
      techModal.setAttribute('aria-hidden', 'false');
    });

    techGrid.appendChild(card);
  });

  function closeTechModal() {
    techModal.classList.remove('active');
    techModal.setAttribute('aria-hidden', 'true');
  }

  techModalClose.addEventListener('click', closeTechModal);
  techModalBackdrop.addEventListener('click', closeTechModal);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && techModal.classList.contains('active')) {
      closeTechModal();
    }
  });


  // --- 5. MOBILE NAV TOGGLE ---
  const mobileToggle = document.getElementById('mobileToggle');
  const navLinks = document.getElementById('navLinks');

  mobileToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
  });

  // Close mobile nav on click
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('active');
    });
  });

});
