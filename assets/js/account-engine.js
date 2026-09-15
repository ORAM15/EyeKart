/**
 * EyeKart Customer Account & Clinic Dossier Controller
 * Manages customer order history, active prescriptions, appointments, and wishlist tabs.
 * Conforms to Protocol v1.1, Phase 1 Remediation.
 */
(function (global) {
  'use strict';

  class AccountEngine {
    constructor() {
      this.activeTab = 'orders';
    }

    init() {
      console.info('[EyeKart Account] Initializing Customer Account Engine...');
      const DOM = (global.EyeKartDOMMap && global.EyeKartDOMMap.account) || {};

      // Check URL parameters for initial tab
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        const params = new URLSearchParams(window.location.search);
        const tabParam = params.get('tab');
        if (tabParam === 'wishlist') {
          this.activeTab = 'wishlist';
        } else if (tabParam === 'prescriptions') {
          this.activeTab = 'prescriptions';
        } else if (tabParam === 'scans') {
          this.activeTab = 'scans';
        } else if (tabParam === 'tryon') {
          this.activeTab = 'tryon';
        }
      }

      this._bindTabs(DOM);
      this._bindActionButtons(DOM);
      this._renderDynamicContent();
      this._renderOrders();
      this._renderPrescriptionCard();
      this._renderTabContent();

      // Subscribe to updates to keep view in sync
      if (global.EyeKartStore) {
        global.EyeKartStore.subscribe('wishlist', () => {
          this._updateWishlistCountBadge();
          if (this.activeTab === 'wishlist') {
            this._renderWishlist();
          }
        });
        global.EyeKartStore.subscribe('orders', () => {
          this._renderDynamicContent();
          this._renderOrders();
          if (this.activeTab === 'prescriptions') {
            this._renderPrescriptionsTab();
          }
        });
        global.EyeKartStore.subscribe('prescription', () => {
          this._renderPrescriptionCard();
          if (this.activeTab === 'prescriptions') {
            this._renderPrescriptionsTab();
          }
        });
      }
    }

    _bindTabs(dom) {
      const tabNames = [
        { label: 'Orders & Dispatch', key: 'orders' },
        { label: 'Clinical Prescriptions', key: 'prescriptions' },
        { label: 'Biometric 3D Scans', key: 'scans' },
        { label: 'Home Try-On Trial', key: 'tryon' },
        { label: 'Saved Frames', key: 'wishlist' }
      ];

      // Inject Wishlist Tab button if not present in tab bar
      const tabContainer = document.querySelector('.overflow-x-auto .flex');
      if (tabContainer && !document.getElementById('tab-btn-wishlist')) {
        const wishlistCount = global.EyeKartStore ? global.EyeKartStore.getWishlistCount() : 0;
        const wishlistTabBtn = document.createElement('button');
        wishlistTabBtn.id = 'tab-btn-wishlist';
        wishlistTabBtn.type = 'button';
        wishlistTabBtn.className = 'px-5 py-3 rounded-lg bg-optical-white text-on-surface-variant hover:text-primary hover:bg-surface-cream font-label-md text-label-md flex items-center gap-2 shrink-0 transition-all shadow-sm';
        wishlistTabBtn.innerHTML = `
          <span class="material-symbols-outlined text-[18px] text-alert-clinical">favorite</span>
          <span>Saved Frames (Wishlist)</span>
          <span class="px-1.5 py-0.5 rounded-full bg-surface-cream text-primary text-[11px] font-bold" id="account-wishlist-badge">${wishlistCount}</span>
        `;
        tabContainer.appendChild(wishlistTabBtn);
      }

      const allButtons = Array.from(document.querySelectorAll(dom.tabButtons || 'button'));
      const tabButtons = allButtons.filter(btn => 
        tabNames.some(t => btn.textContent.includes(t.label))
      );

      tabButtons.forEach(btn => {
        if (btn.__eyekart_bound) return;
        btn.__eyekart_bound = true;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const matched = tabNames.find(t => btn.textContent.includes(t.label));
          if (matched) {
            this.activeTab = matched.key;

            tabButtons.forEach(b => {
              b.classList.remove('bg-primary', 'text-optical-white');
              b.classList.add('bg-optical-white', 'text-primary');
            });

            btn.classList.remove('bg-optical-white', 'text-primary');
            btn.classList.add('bg-primary', 'text-optical-white');

            this._renderTabContent();

            if (global.EyeKartStore) {
              global.EyeKartStore.showToast(`Switched to: ${matched.label}`, 'tab');
            }
          }
        });
      });

      // Synchronize initial tab styling
      tabButtons.forEach(b => {
        const matched = tabNames.find(t => b.textContent.includes(t.label));
        if (matched && matched.key === this.activeTab) {
          b.classList.remove('bg-optical-white', 'text-primary', 'text-on-surface-variant');
          b.classList.add('bg-primary', 'text-optical-white');
        } else if (matched) {
          b.classList.remove('bg-primary', 'text-optical-white');
          b.classList.add('bg-optical-white', 'text-on-surface-variant');
        }
      });
    }

    _bindActionButtons(dom) {
      const allButtons = Array.from(document.querySelectorAll(dom.actionButtons || 'button'));

      // Concierge WhatsApp button
      const waBtn = allButtons.find(b => b.textContent.includes('WhatsApp'));
      if (waBtn && !waBtn.__eyekart_bound) {
        waBtn.__eyekart_bound = true;
        waBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.open('https://wa.me/254700393527?text=Hello%20EyeKart%20Nairobi%20Atelier%2C%20I%20have%20an%20inquiry%20regarding%20my%20order', '_blank');
        });
      }

      // Download dossier PDF button
      const dlBtn = allButtons.find(b => b.textContent.includes('Full Dossier PDF') || b.textContent.includes('Dossier'));
      if (dlBtn && !dlBtn.__eyekart_bound) {
        dlBtn.__eyekart_bound = true;
        dlBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (global.EyeKartStore) {
            global.EyeKartStore.showToast('Preparing full clinical ophthalmic dossier (PDF)...', 'sync');
            setTimeout(() => {
              global.EyeKartStore.showToast('Clinical Dossier downloaded (2.4 MB)', 'download_done');
            }, 1200);
          }
        });
      }

      // Track Live Courier
      const trackBtn = allButtons.find(b => b.textContent.includes('Track Live Courier'));
      if (trackBtn && !trackBtn.__eyekart_bound) {
        trackBtn.__eyekart_bound = true;
        trackBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (global.EyeKartRouter) {
            global.EyeKartRouter.navigate('order-tracking');
          }
        });
      }

      // KRA ETR Tax Invoice
      const kraBtn = allButtons.find(b => b.textContent.includes('KRA ETR Tax Invoice'));
      if (kraBtn && !kraBtn.__eyekart_bound) {
        kraBtn.__eyekart_bound = true;
        kraBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (global.EyeKartRouter) {
            global.EyeKartRouter.navigate('tax-invoice');
          }
        });
      }

      // Schedule Exam
      const schedBtn = allButtons.find(b => b.textContent.includes('Schedule Exam'));
      if (schedBtn && !schedBtn.__eyekart_bound) {
        schedBtn.__eyekart_bound = true;
        schedBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (global.EyeKartRouter) {
            global.EyeKartRouter.navigate('book-eye-test');
          }
        });
      }

      // Upload New Prescription
      const uploadBtn = allButtons.find(b => b.textContent.includes('Upload New Prescription'));
      if (uploadBtn && !uploadBtn.__eyekart_bound) {
        uploadBtn.__eyekart_bound = true;
        uploadBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (global.EyeKartRouter) {
            global.EyeKartRouter.navigate('upload-prescription');
          }
        });
      }
    }

    _updateWishlistCountBadge() {
      const badge = document.getElementById('account-wishlist-badge');
      if (badge && global.EyeKartStore) {
        badge.textContent = global.EyeKartStore.getWishlistCount();
      }
    }

    _renderTabContent() {
      const mainCol = document.querySelector('.lg\\:col-span-8');
      if (!mainCol) return;

      let wishlistContainer = document.getElementById('account-wishlist-view');
      let prescriptionsContainer = document.getElementById('account-prescriptions-view');

      if (this.activeTab === 'wishlist') {
        Array.from(mainCol.children).forEach(child => {
          if (child.id !== 'account-wishlist-view') child.classList.add('hidden');
        });
        if (!wishlistContainer) {
          wishlistContainer = document.createElement('div');
          wishlistContainer.id = 'account-wishlist-view';
          mainCol.appendChild(wishlistContainer);
        }
        wishlistContainer.classList.remove('hidden');
        if (prescriptionsContainer) prescriptionsContainer.classList.add('hidden');
        this._renderWishlist();
      } else if (this.activeTab === 'prescriptions') {
        Array.from(mainCol.children).forEach(child => {
          if (child.id !== 'account-prescriptions-view') child.classList.add('hidden');
        });
        if (!prescriptionsContainer) {
          prescriptionsContainer = document.createElement('div');
          prescriptionsContainer.id = 'account-prescriptions-view';
          mainCol.appendChild(prescriptionsContainer);
        }
        prescriptionsContainer.classList.remove('hidden');
        if (wishlistContainer) wishlistContainer.classList.add('hidden');
        this._renderPrescriptionsTab();
      } else {
        // Show default order sections
        Array.from(mainCol.children).forEach(child => {
          if (child.id !== 'account-wishlist-view' && child.id !== 'account-prescriptions-view') {
            child.classList.remove('hidden');
          }
        });
        if (wishlistContainer) wishlistContainer.classList.add('hidden');
        if (prescriptionsContainer) prescriptionsContainer.classList.add('hidden');
      }
    }

    _renderPrescriptionsTab() {
      const container = document.getElementById('account-prescriptions-view');
      if (!container) return;

      const store = global.EyeKartStore;
      const router = global.EyeKartRouter;
      const rx = store ? store.getPrescription() : null;
      const orders = store ? store.getOrders() : [];
      const pendingOrders = store ? store.getPendingReviewOrders() : [];
      const clarificationOrder = orders.find(o => o.prescriptionStatus === 'CLARIFICATION_REQUESTED' || o.status === 'CLARIFICATION_REQUESTED');

      // Clinical Honesty Badge Configuration
      const status = rx?.verificationStatus || (rx?.verified ? 'OPTOMETRIST_VERIFIED' : 'USER_ENTERED');
      let badgeHtml = '';
      let explanationText = '';

      if (status === 'OPTOMETRIST_VERIFIED' || status === 'APPROVED') {
        badgeHtml = `<span class="px-3 py-1 rounded-full bg-mpesa-green/15 text-mpesa-green font-label-md text-label-md font-bold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">verified</span> Valid Active Rx • Cleared for Surfacing</span>`;
        explanationText = `Certified by Dr. Kevin Omondi (MCOptom, OCK #0512) • Valid for ZEISS Free-Form CNC Diamond Bevel Surfacing.`;
      } else if (status === 'PENDING_OPTOMETRIST_REVIEW') {
        badgeHtml = `<span class="px-3 py-1 rounded-full bg-amber-500/15 text-amber-800 font-label-md text-label-md font-bold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">hourglass_top</span> Pending Optometrist Review</span>`;
        explanationText = `Prescription submitted by customer. In queue at Sarit Centre 3D Diagnostic Wing. Laboratory edging blocked until clearance.`;
      } else if (status === 'REJECTED') {
        badgeHtml = `<span class="px-3 py-1 rounded-full bg-error/15 text-error font-label-md text-label-md font-bold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">cancel</span> Prescription Declined</span>`;
        explanationText = `Clinical parameter discrepancy detected. Review reason below or schedule an in-person diagnostic appointment.`;
      } else if (status === 'CLARIFICATION_REQUESTED') {
        badgeHtml = `<span class="px-3 py-1 rounded-full bg-cyan-700/15 text-cyan-800 font-label-md text-label-md font-bold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">help_outline</span> Clarification Requested</span>`;
        explanationText = `Attending optometrist requires verification of specific diopter or pupillary distance parameters.`;
      } else {
        badgeHtml = `<span class="px-3 py-1 rounded-full bg-surface-cream text-primary border border-outline-variant/40 font-label-md text-label-md font-bold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">edit_note</span> Customer-Entered Prescription</span>`;
        explanationText = `Self-reported optical parameters. Clinical gating requires optometrist review before free-form surfacing.`;
      }

      const od = rx?.od || { sph: '-4.25', cyl: '-0.75', axis: '095', add: '+0.75' };
      const os = rx?.os || { sph: '-3.75', cyl: '-0.50', axis: '085', add: '+0.75' };
      const pd = rx?.pd || '63.5';

      container.innerHTML = `
        <div class="space-y-6">
          <!-- Main Prescription Vault Card -->
          <div class="bg-optical-white rounded-xl shadow-md p-6 lg:p-8 space-y-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-outline-variant/30">
              <div>
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-secondary text-[22px]">visibility</span>
                  <span class="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold">Ophthalmic Medical Record</span>
                </div>
                <h2 class="font-headline-md text-headline-md text-primary mt-1">Clinical Prescriptions Vault</h2>
                <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">${explanationText}</p>
              </div>
              <div class="self-start sm:self-auto">
                ${badgeHtml}
              </div>
            </div>

            <!-- Diopter Grid Table -->
            <div class="overflow-x-auto">
              <table class="w-full text-left text-body-sm font-body-sm">
                <thead>
                  <tr class="bg-surface-cream text-on-surface uppercase text-label-sm font-label-sm tracking-wider">
                    <th class="py-3 px-4 rounded-l">Ocular Lane</th>
                    <th class="py-3 px-4">Sphere (SPH)</th>
                    <th class="py-3 px-4">Cylinder (CYL)</th>
                    <th class="py-3 px-4">Axis</th>
                    <th class="py-3 px-4">Near Add</th>
                    <th class="py-3 px-4 rounded-r">Mono PD</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-hairline/60">
                  <tr class="hover:bg-surface-ivory transition-colors">
                    <td class="py-3.5 px-4 font-semibold text-primary flex items-center gap-2">
                      <span class="w-6 h-6 rounded bg-primary text-optical-white text-[10px] font-bold flex items-center justify-center">OD</span>
                      <span>Right Eye (Oculus Dexter)</span>
                    </td>
                    <td class="py-3.5 px-4 font-data-metric text-data-metric text-primary">${od.sph || '0.00'}</td>
                    <td class="py-3.5 px-4 font-data-metric text-data-metric text-secondary">${od.cyl || '0.00'}</td>
                    <td class="py-3.5 px-4 font-data-metric text-data-metric text-primary">${od.axis ? od.axis + '°' : '—'}</td>
                    <td class="py-3.5 px-4 font-data-metric text-data-metric text-on-surface-variant">${od.add || '—'}</td>
                    <td class="py-3.5 px-4 font-data-metric text-data-metric text-primary font-bold">${(parseFloat(pd)/2).toFixed(1)} mm</td>
                  </tr>
                  <tr class="hover:bg-surface-ivory transition-colors">
                    <td class="py-3.5 px-4 font-semibold text-primary flex items-center gap-2">
                      <span class="w-6 h-6 rounded bg-secondary text-optical-white text-[10px] font-bold flex items-center justify-center">OS</span>
                      <span>Left Eye (Oculus Sinister)</span>
                    </td>
                    <td class="py-3.5 px-4 font-data-metric text-data-metric text-primary">${os.sph || '0.00'}</td>
                    <td class="py-3.5 px-4 font-data-metric text-data-metric text-secondary">${os.cyl || '0.00'}</td>
                    <td class="py-3.5 px-4 font-data-metric text-data-metric text-primary">${os.axis ? os.axis + '°' : '—'}</td>
                    <td class="py-3.5 px-4 font-data-metric text-data-metric text-on-surface-variant">${os.add || '—'}</td>
                    <td class="py-3.5 px-4 font-data-metric text-data-metric text-primary font-bold">${(parseFloat(pd)/2).toFixed(1)} mm</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Biometric Centration Footer -->
            <div class="p-4 rounded-lg bg-surface-ivory flex flex-col sm:flex-row items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-secondary text-[24px]">straighten</span>
                <div>
                  <span class="font-label-sm text-[11px] uppercase tracking-wider text-on-surface-variant block">Binocular Pupillary Distance</span>
                  <span class="font-data-metric text-data-metric text-primary font-bold">${pd} mm (Dual Laser Calibrated)</span>
                </div>
              </div>
              <a href="${router ? router.resolveTarget('clinical-report') : '#'}" data-path="clinical-report" class="px-4 py-2 bg-primary text-optical-white rounded font-label-md text-label-md hover:bg-graphite transition-all flex items-center gap-2 shadow-sm shrink-0">
                <span class="material-symbols-outlined text-[16px]">description</span>
                <span>Full 28-Point Clinical Dossier</span>
              </a>
            </div>
          </div>

          <!-- Customer Clarification Resubmission Card (if active) -->
          ${clarificationOrder ? `
            <div class="bg-cyan-500/10 border border-cyan-700/30 rounded-xl p-6 space-y-4">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-cyan-800 text-[24px]">help_outline</span>
                <h3 class="font-title-md text-title-md text-cyan-900 font-bold">Action Required: Clarification Query for Order #${clarificationOrder.orderId}</h3>
              </div>
              <div class="p-3 bg-optical-white rounded border border-cyan-700/20 text-body-sm text-cyan-950 font-medium">
                <strong>Optometrist Query:</strong> "${clarificationOrder.clarificationRequest || 'Please verify axis angle and pupillary distance.'}"
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="block text-[11px] font-label-sm uppercase text-cyan-900 mb-1">OD Axis (°)</label>
                  <input id="input-clarify-od-axis" type="number" value="${clarificationOrder.prescriptionSnapshot?.od?.axis || '095'}" class="w-full px-3 py-2 bg-optical-white border border-cyan-700/30 rounded text-body-sm font-data-metric text-primary focus:outline-none" />
                </div>
                <div>
                  <label class="block text-[11px] font-label-sm uppercase text-cyan-900 mb-1">OS Axis (°)</label>
                  <input id="input-clarify-os-axis" type="number" value="${clarificationOrder.prescriptionSnapshot?.os?.axis || '085'}" class="w-full px-3 py-2 bg-optical-white border border-cyan-700/30 rounded text-body-sm font-data-metric text-primary focus:outline-none" />
                </div>
                <div>
                  <label class="block text-[11px] font-label-sm uppercase text-cyan-900 mb-1">Total PD (mm)</label>
                  <input id="input-clarify-pd" type="number" step="0.5" value="${clarificationOrder.prescriptionSnapshot?.pd || '63.5'}" class="w-full px-3 py-2 bg-optical-white border border-cyan-700/30 rounded text-body-sm font-data-metric text-primary focus:outline-none" />
                </div>
              </div>
              <div>
                <label class="block text-[11px] font-label-sm uppercase text-cyan-900 mb-1">Patient Clarification Note</label>
                <input id="input-clarify-note" type="text" placeholder="e.g., Re-checked prescription card from Aga Khan visit: OD Axis is confirmed 095°." class="w-full px-3 py-2 bg-optical-white border border-cyan-700/30 rounded text-body-sm text-primary focus:outline-none" />
              </div>
              <button id="btn-submit-clarification" class="px-5 py-2.5 rounded bg-cyan-800 text-optical-white font-label-md text-label-md font-semibold hover:bg-cyan-900 transition-all flex items-center gap-2 shadow-sm">
                <span class="material-symbols-outlined text-[16px]">send</span>
                <span>Submit Clarification for Optometrist Re-Review</span>
              </button>
            </div>
          ` : ''}

          <!-- Optometrist Clinical Review Operations Queue (Simulated Role) -->
          ${pendingOrders.length > 0 ? `
            <div class="bg-amber-500/10 border border-amber-600/30 rounded-xl p-6 space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-amber-800 text-[24px]">clinical_notes</span>
                  <div>
                    <h3 class="font-title-md text-title-md text-amber-900 font-bold">Optometrist Clinical Review Queue (Role Simulation)</h3>
                    <p class="font-body-sm text-xs text-amber-800">${pendingOrders.length} Order(s) Awaiting Licensed Clinician Clearance</p>
                  </div>
                </div>
                <span class="px-2 py-1 rounded bg-amber-500/20 text-amber-900 font-mono text-[11px] font-bold">OCK #0512</span>
              </div>

              <div class="space-y-3">
                ${pendingOrders.map(order => `
                  <div class="p-4 bg-optical-white rounded-lg border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4" data-review-order="${order.orderId}">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-data-metric text-[13px] text-primary font-bold">Order #${order.orderId}</span>
                        <span class="text-on-surface-variant text-[11px]">•</span>
                        <span class="text-body-sm text-xs text-on-surface-variant">${order.customer?.name || 'Patient'}</span>
                      </div>
                      <p class="font-body-sm text-xs text-on-surface-variant mt-1">${order.itemsSummary || 'Prescription Optical Order'}</p>
                      <p class="font-data-metric text-xs text-primary mt-1">OD: ${order.prescriptionSnapshot?.od?.sph || '-4.25'} / ${order.prescriptionSnapshot?.od?.cyl || '-0.75'} x ${order.prescriptionSnapshot?.od?.axis || '095'}° | PD: ${order.prescriptionSnapshot?.pd || '63.5'} mm</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <button class="px-3 py-2 bg-mpesa-green text-optical-white rounded font-label-sm text-xs font-semibold hover:brightness-105 transition-all flex items-center gap-1 shadow-sm btn-action-approve" data-order-id="${order.orderId}">
                        <span class="material-symbols-outlined text-[14px]">verified</span>
                        <span>Approve</span>
                      </button>
                      <button class="px-3 py-2 bg-surface-cream text-cyan-800 border border-cyan-700/20 rounded font-label-sm text-xs font-semibold hover:bg-cyan-50 transition-all flex items-center gap-1 btn-action-clarify" data-order-id="${order.orderId}">
                        <span class="material-symbols-outlined text-[14px]">help_outline</span>
                        <span>Clarify</span>
                      </button>
                      <button class="px-3 py-2 bg-error/10 text-error border border-error/20 rounded font-label-sm text-xs font-semibold hover:bg-error/20 transition-all flex items-center gap-1 btn-action-reject" data-order-id="${order.orderId}">
                        <span class="material-symbols-outlined text-[14px]">cancel</span>
                        <span>Decline</span>
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;

      // Wire Clarification Submission
      if (clarificationOrder) {
        const submitBtn = container.querySelector('#btn-submit-clarification');
        if (submitBtn) {
          submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const odAxis = container.querySelector('#input-clarify-od-axis')?.value || '095';
            const osAxis = container.querySelector('#input-clarify-os-axis')?.value || '085';
            const pdVal = container.querySelector('#input-clarify-pd')?.value || '63.5';
            const noteVal = container.querySelector('#input-clarify-note')?.value || 'Customer verified axis and pupillary distance with recent prescription.';

            store.submitPrescriptionClarification(clarificationOrder.orderId, {
              od: { axis: odAxis },
              os: { axis: osAxis },
              pd: pdVal
            }, noteVal);
          });
        }
      }

      // Wire Simulated Optometrist Queue Actions
      container.querySelectorAll('.btn-action-approve').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const ordId = btn.getAttribute('data-order-id');
          if (ordId && store) store.reviewPrescription(ordId, 'APPROVE');
        });
      });
      container.querySelectorAll('.btn-action-clarify').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const ordId = btn.getAttribute('data-order-id');
          if (ordId && store) store.reviewPrescription(ordId, 'REQUEST_CLARIFICATION', { notes: 'Please verify axis angles and monocular centration.' });
        });
      });
      container.querySelectorAll('.btn-action-reject').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const ordId = btn.getAttribute('data-order-id');
          if (ordId && store) store.reviewPrescription(ordId, 'REJECT', { reason: 'Prescription CYL diopter out of range for thin wire rim frame profile.' });
        });
      });
    }

    _renderWishlist() {
      const container = document.getElementById('account-wishlist-view');
      if (!container) return;

      const wishlist = global.EyeKartStore ? (global.EyeKartStore.state.wishlist || []) : [];
      const catalog = global.CatalogService;

      if (wishlist.length === 0) {
        container.innerHTML = `
          <div class="bg-optical-white rounded-xl shadow-md p-6 lg:p-8 space-y-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-outline-variant/30">
              <div>
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-alert-clinical text-[22px]">favorite</span>
                  <span class="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold">Atelier Curation</span>
                </div>
                <h2 class="font-headline-md text-headline-md text-primary mt-1">Saved Frames &amp; Atelier Wishlist</h2>
                <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Optical silhouettes and titanium frames saved across your browsing sessions.</p>
              </div>
              <span class="px-3 py-1 rounded-full bg-surface-cream text-primary font-label-md text-label-md font-bold self-start sm:self-auto">0 Saved Frames</span>
            </div>
            <div class="py-12 flex flex-col items-center justify-center text-center space-y-3 bg-surface-cream/40 rounded-xl p-8">
              <span class="material-symbols-outlined text-[48px] text-outline">favorite_border</span>
              <h3 class="font-title-md text-title-md text-primary font-bold">Your Saved Frames List is Empty</h3>
              <p class="font-body-sm text-body-sm text-on-surface-variant max-w-sm">Save your favorite Japanese titanium, Mazzucchelli acetate, or equatorial sun frames while browsing the catalog.</p>
              <a href="${global.EyeKartRouter ? global.EyeKartRouter.resolveTarget('catalog') : '#'}" data-path="catalog" class="mt-2 px-5 py-2.5 bg-primary text-on-primary font-label-md text-label-md rounded shadow-sm hover:bg-graphite transition-colors inline-flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">view_in_ar</span>
                <span>Explore Dispensary Catalog</span>
              </a>
            </div>
          </div>
        `;
        return;
      }

      const cardsHtml = wishlist.map(sku => {
        const frame = catalog ? catalog.getBySku(sku) : null;
        if (!frame) return '';
        const priceStr = catalog ? catalog.formatPriceKSh(frame.price) : `KSh ${Number(frame.price).toLocaleString('en-KE')}`;
        const imgUrl = (frame.gallery && frame.gallery[0]) || '';

        return `
          <div class="p-4 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 flex flex-col justify-between group hover:shadow-md transition-all" data-wishlist-card="${frame.sku}">
            <div>
              <div class="flex items-center justify-between gap-2 mb-2">
                <span class="px-2 py-0.5 bg-surface-container-high text-on-surface font-label-sm text-[10px] uppercase font-bold rounded">${frame.sku}</span>
                <button class="p-1 text-outline hover:text-error rounded-full transition-colors btn-remove-wishlist" data-sku="${frame.sku}" title="Remove from Saved Frames">
                  <span class="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <div class="h-32 w-full bg-surface-ivory rounded-lg flex items-center justify-center p-2 mb-3 overflow-hidden">
                <img class="h-full w-auto object-contain group-hover:scale-105 transition-transform duration-300" src="${imgUrl}" alt="${frame.sku} ${frame.name}" />
              </div>
              <h4 class="font-title-md text-title-md text-primary font-bold line-clamp-1">${frame.name}</h4>
              <p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-1">${frame.material}</p>
              <div class="mt-2 flex items-baseline justify-between">
                <span class="font-data-metric text-data-metric text-primary">${priceStr}</span>
                <span class="font-label-sm text-[11px] text-outline">${frame.dimensions}</span>
              </div>
            </div>
            <div class="mt-4 pt-3 border-t border-outline-variant/20 flex gap-2">
              <a href="${global.EyeKartRouter ? global.EyeKartRouter.resolveTarget('lens-customizer', 'sku=' + frame.sku) : '#'}" data-path="lens-customizer" class="flex-1 py-2 bg-primary hover:bg-graphite text-on-primary font-label-sm text-label-sm rounded transition-colors text-center">Configure Lenses</a>
              <a href="${global.EyeKartRouter ? global.EyeKartRouter.resolveTarget('product-details', 'sku=' + frame.sku) : '#'}" data-path="product-details" class="px-2.5 py-2 bg-surface-cream hover:bg-surface-container-high text-on-surface rounded transition-colors flex items-center justify-center" title="View 3D Studio">
                <span class="material-symbols-outlined text-[18px]">view_in_ar</span>
              </a>
            </div>
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <div class="bg-optical-white rounded-xl shadow-md p-6 lg:p-8 space-y-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-outline-variant/30">
            <div>
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-alert-clinical text-[22px]">favorite</span>
                <span class="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold">Atelier Curation</span>
              </div>
              <h2 class="font-headline-md text-headline-md text-primary mt-1">Saved Frames &amp; Atelier Wishlist</h2>
              <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Optical silhouettes and titanium frames saved across your browsing sessions.</p>
            </div>
            <span class="px-3 py-1 rounded-full bg-surface-cream text-primary font-label-md text-label-md font-bold self-start sm:self-auto">${wishlist.length} Saved Frame${wishlist.length === 1 ? '' : 's'}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${cardsHtml}
          </div>
        </div>
      `;

      // Wire remove buttons
      container.querySelectorAll('.btn-remove-wishlist').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const sku = btn.getAttribute('data-sku');
          if (sku && global.EyeKartStore) {
            global.EyeKartStore.toggleWishlist(sku);
          }
        });
      });
    }

    _renderOrders() {
      if (!global.EyeKartStore) return;
      const orders = global.EyeKartStore.getOrders();
      if (!orders || orders.length === 0) return;

      const activeOrder = orders[0];

      // 1. Update In-Flight Spotlight Header
      const spotlightTitle = document.querySelector('[class*="lg:col-span-8"] h2');
      if (spotlightTitle && (spotlightTitle.textContent.includes('Order #EK-') || spotlightTitle.textContent.includes('Order #'))) {
        spotlightTitle.textContent = `Order #${activeOrder.orderId}`;
      }

      // 2. Update Product Name & Price in Active Order
      const itemTitle = document.querySelector('[class*="lg:col-span-8"] h3');
      if (itemTitle && (itemTitle.textContent.includes('Kibera Minimalist') || itemTitle.textContent.includes('EK-902') || itemTitle.textContent.includes('EK-'))) {
        const primary = activeOrder.items && activeOrder.items[0];
        if (primary) {
          itemTitle.textContent = `${primary.name} (${primary.sku})`;
        } else if (activeOrder.itemsSummary) {
          itemTitle.textContent = activeOrder.itemsSummary;
        }
      }

      const priceMetric = document.querySelector('[class*="lg:col-span-8"] [class*="md:col-span-8"] .font-data-metric, [class*="lg:col-span-8"] .font-data-metric');
      if (priceMetric) {
        priceMetric.textContent = global.CatalogService ? global.CatalogService.formatPriceKSh(activeOrder.total) : `KSh ${Number(activeOrder.total).toLocaleString('en-KE')}`;
      }

      // 3. Update M-PESA Receipt
      const mpesaRefEl = Array.from(document.querySelectorAll('[class*="lg:col-span-8"] span')).find(s => s.textContent && s.textContent.includes('M-PESA STK Push'));
      if (mpesaRefEl && activeOrder.mpesaReceipt) {
        mpesaRefEl.innerHTML = `<span class="material-symbols-outlined text-[15px]">check_circle</span> M-PESA STK Push #${activeOrder.mpesaReceipt} Completed`;
      }

      // 4. Update Status Tag and Operational Progress
      const statusBadge = document.querySelector('[class*="lg:col-span-8"] .bg-secondary-container, [class*="lg:col-span-8"] [class*="rounded-full"][class*="text-"]');
      const progressBar = document.querySelector('[class*="lg:col-span-8"] .bg-secondary.h-full');
      const stepLabels = document.querySelectorAll('[class*="lg:col-span-8"] .grid-cols-5 span');

      if (activeOrder.status === 'CANCELLED') {
        if (statusBadge) {
          statusBadge.className = 'px-3 py-1.5 rounded-full bg-error/10 text-error font-label-md text-label-md flex items-center gap-1.5';
          statusBadge.innerHTML = '<span class="material-symbols-outlined text-[18px]">cancel</span><span>Cancelled (Simulated Refund)</span>';
        }
        if (progressBar) progressBar.style.width = '0%';
      } else if (activeOrder.status === 'PRESCRIPTION_REVIEW' || activeOrder.prescriptionStatus === 'PENDING_OPTOMETRIST_REVIEW') {
        if (statusBadge) {
          statusBadge.className = 'px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-800 font-label-md text-label-md flex items-center gap-1.5 font-semibold';
          statusBadge.innerHTML = '<span class="material-symbols-outlined text-[18px]">clinical_notes</span><span>Stage 2 of 10: Prescription Review Pending</span>';
        }
        if (progressBar) progressBar.style.width = '20%';
        if (stepLabels && stepLabels[0]) stepLabels[0].textContent = '1. M-PESA Paid';
        if (stepLabels && stepLabels[1]) {
          stepLabels[1].textContent = '2. Rx In Review';
          stepLabels[1].className = 'text-secondary font-bold';
        }
        if (stepLabels && stepLabels[2]) stepLabels[2].className = 'text-outline';
        if (stepLabels && stepLabels[3]) stepLabels[3].className = 'text-outline';
      } else if (activeOrder.status === 'PRESCRIPTION_REJECTED' || activeOrder.prescriptionStatus === 'REJECTED') {
        if (statusBadge) {
          statusBadge.className = 'px-3 py-1.5 rounded-full bg-error/15 text-error font-label-md text-label-md flex items-center gap-1.5 font-semibold';
          statusBadge.innerHTML = '<span class="material-symbols-outlined text-[18px]">error</span><span>Prescription Declined: Action Required</span>';
        }
        if (progressBar) {
          progressBar.style.width = '20%';
          progressBar.className = 'bg-error h-full rounded-full transition-all duration-500';
        }
      } else if (activeOrder.status === 'CLARIFICATION_REQUESTED' || activeOrder.prescriptionStatus === 'CLARIFICATION_REQUESTED') {
        if (statusBadge) {
          statusBadge.className = 'px-3 py-1.5 rounded-full bg-cyan-700/15 text-cyan-800 font-label-md text-label-md flex items-center gap-1.5 font-semibold';
          statusBadge.innerHTML = '<span class="material-symbols-outlined text-[18px]">help_outline</span><span>Clarification Requested by Optometrist</span>';
        }
        if (progressBar) progressBar.style.width = '20%';
      } else if (activeOrder.status === 'PROCESSING' || activeOrder.status === 'LAB_SURFACING') {
        if (statusBadge) {
          statusBadge.className = 'px-3 py-1.5 rounded-full bg-secondary-container text-on-secondary-container font-label-md text-label-md flex items-center gap-1.5 font-semibold';
          statusBadge.innerHTML = '<span class="material-symbols-outlined text-[18px]">precision_manufacturing</span><span>Stage 3 of 10: German CNC Lens Edging</span>';
        }
        if (progressBar) progressBar.style.width = '40%';
      } else if (activeOrder.status === 'QA_CLINICAL') {
        if (statusBadge) {
          statusBadge.className = 'px-3 py-1.5 rounded-full bg-secondary-container text-on-secondary-container font-label-md text-label-md flex items-center gap-1.5 font-semibold';
          statusBadge.innerHTML = '<span class="material-symbols-outlined text-[18px]">verified</span><span>Stage 5 of 10: Dual Laser Pupillometer QA Passed</span>';
        }
        if (progressBar) progressBar.style.width = '60%';
      } else if (activeOrder.status === 'DISPATCHED') {
        if (statusBadge) {
          statusBadge.className = 'px-3 py-1.5 rounded-full bg-secondary-container text-on-secondary-container font-label-md text-label-md flex items-center gap-1.5';
          statusBadge.innerHTML = '<span class="material-symbols-outlined text-[18px]">two_wheeler</span><span>Stage 8 of 10: Out for Delivery</span>';
        }
        if (progressBar) progressBar.style.width = '80%';
      } else if (activeOrder.status === 'DELIVERED') {
        if (statusBadge) {
          statusBadge.className = 'px-3 py-1.5 rounded-full bg-mpesa-green/15 text-mpesa-green font-label-md text-label-md flex items-center gap-1.5 font-bold';
          statusBadge.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span><span>Stage 10 of 10: Delivered & Custom Fitted</span>';
        }
        if (progressBar) progressBar.style.width = '100%';
      }
    }

    _renderPrescriptionCard() {
      if (!global.EyeKartStore) return;
      const rx = global.EyeKartStore.getPrescription();
      if (!rx) return;

      const sidebar = document.querySelector('[class*="lg:col-span-4"]');
      if (!sidebar) return;

      // Find Prescription Status Badge in sidebar
      const badgeContainer = sidebar.querySelector('.bg-optical-white span');
      if (badgeContainer) {
        const status = rx.verificationStatus || (rx.verified ? 'OPTOMETRIST_VERIFIED' : 'USER_ENTERED');
        if (status === 'OPTOMETRIST_VERIFIED' || status === 'APPROVED') {
          badgeContainer.className = 'px-2.5 py-1 rounded bg-mpesa-green/10 text-mpesa-green font-label-sm text-label-sm font-bold uppercase tracking-wider flex items-center gap-1 inline-flex';
          badgeContainer.innerHTML = '<span class="material-symbols-outlined text-[14px]">verified</span> Valid Active Rx';
        } else if (status === 'PENDING_OPTOMETRIST_REVIEW') {
          badgeContainer.className = 'px-2.5 py-1 rounded bg-amber-500/15 text-amber-800 font-label-sm text-label-sm font-bold uppercase tracking-wider flex items-center gap-1 inline-flex';
          badgeContainer.innerHTML = '<span class="material-symbols-outlined text-[14px]">hourglass_top</span> Pending Optometrist Review';
        } else if (status === 'REJECTED') {
          badgeContainer.className = 'px-2.5 py-1 rounded bg-error/15 text-error font-label-sm text-label-sm font-bold uppercase tracking-wider flex items-center gap-1 inline-flex';
          badgeContainer.innerHTML = '<span class="material-symbols-outlined text-[14px]">cancel</span> Prescription Declined';
        } else if (status === 'CLARIFICATION_REQUESTED') {
          badgeContainer.className = 'px-2.5 py-1 rounded bg-cyan-700/15 text-cyan-800 font-label-sm text-label-sm font-bold uppercase tracking-wider flex items-center gap-1 inline-flex';
          badgeContainer.innerHTML = '<span class="material-symbols-outlined text-[14px]">help_outline</span> Clarification Requested';
        } else {
          // USER_ENTERED
          badgeContainer.className = 'px-2.5 py-1 rounded bg-surface-cream text-primary font-label-sm text-label-sm font-bold uppercase tracking-wider flex items-center gap-1 inline-flex border border-outline-variant/30';
          badgeContainer.innerHTML = '<span class="material-symbols-outlined text-[14px]">edit_note</span> Customer-Entered Rx';
        }
      }

      // Update diopters table
      const rows = sidebar.querySelectorAll('tbody tr');
      if (rows.length >= 2 && rx.od && rx.os) {
        // OD row
        const odCells = rows[0].querySelectorAll('td');
        if (odCells.length >= 4) {
          odCells[1].textContent = rx.od.sph || '-4.25';
          odCells[2].textContent = rx.od.cyl || '-0.75';
          odCells[3].textContent = (rx.od.axis ? `${rx.od.axis}°` : '95°');
        }
        // OS row
        const osCells = rows[1].querySelectorAll('td');
        if (osCells.length >= 4) {
          osCells[1].textContent = rx.os.sph || '-3.75';
          osCells[2].textContent = rx.os.cyl || '-0.50';
          osCells[3].textContent = (rx.os.axis ? `${rx.os.axis}°` : '85°');
        }
      }

      // Update PD readout
      const pdMetric = sidebar.querySelector('.font-data-metric.text-data-metric.text-primary.font-bold');
      if (pdMetric && rx.pd) {
        pdMetric.textContent = `${rx.pd} mm`;
      }
    }

    _renderDynamicContent() {
      if (!global.EyeKartStore) return;

      const aptCountEl = document.getElementById('account-appointments-count');
      if (aptCountEl) {
        const count = global.EyeKartStore.state.appointments.length;
        aptCountEl.textContent = count;
      }

      let orderCountEl = document.getElementById('account-orders-count');
      if (!orderCountEl) {
        const ordersTabBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Orders & Dispatch'));
        if (ordersTabBtn) {
          orderCountEl = ordersTabBtn.querySelector('.rounded-full');
        }
      }
      if (orderCountEl && global.EyeKartStore) {
        orderCountEl.textContent = global.EyeKartStore.getOrders().length;
      }

      this._updateWishlistCountBadge();
    }
  }

  global.EyeKartAccount = new AccountEngine();

})(typeof window !== 'undefined' ? window : this);
