/**
 * EyeKart 28-Point Clinical Exam Booking Engine
 * Manages physical clinic hubs, date/time scheduling, and patient dossier persistence.
 * Conforms to Protocol v1.1, Phase 1 Remediation.
 */
(function (global) {
  'use strict';

  class BookingEngine {
    constructor() {
      this.selectedClinic = {
        id: 'sarit_centre',
        name: 'Sarit Centre Precision Clinic',
        lead: 'Dr. Farida Onyango (Council #281)',
        address: 'Lower Ground Wing, Sarit Centre, Westlands'
      };
      this.selectedDate = 'Friday, 17 Nov';
      this.selectedTime = '10:30 AM';
      this.selectedOptometrist = 'Dr. Farida Onyango';
    }

    init() {
      console.info('[EyeKart Booking] Initializing Clinical Exam Booking Engine...');
      const DOM = (global.EyeKartDOMMap && global.EyeKartDOMMap.booking) || {};

      this._bindClinicSelection(DOM);
      this._bindDateSelection(DOM);
      this._bindTimeSlots(DOM);
      this._bindBookingConfirmation(DOM);
    }

    _bindClinicSelection(dom) {
      const clinicCards = document.querySelectorAll(dom.clinicCards || '[onclick*="selectClinic"]');
      clinicCards.forEach(card => {
        if (card.__eyekart_bound) return;
        card.__eyekart_bound = true;
        card.addEventListener('click', () => {
          const nameEl = card.querySelector('h3, h4, .font-bold');
          const addrEl = card.querySelector('p, .text-on-surface-variant');
          if (nameEl) this.selectedClinic.name = nameEl.textContent.trim();
          if (addrEl) this.selectedClinic.address = addrEl.textContent.trim();
          this._syncToStore();
        });
      });
    }

    _bindDateSelection(dom) {
      const dateChips = document.querySelectorAll(dom.dateChips || 'button[onclick*="selectDate"]');
      dateChips.forEach(chip => {
        if (chip.__eyekart_bound) return;
        chip.__eyekart_bound = true;
        chip.addEventListener('click', () => {
          const match = chip.getAttribute('onclick')?.match(/selectDate\s*\(\s*this\s*,\s*['"]([^'"]+)['"]/);
          if (match) {
            this.selectedDate = match[1];
          } else {
            this.selectedDate = chip.textContent.trim().replace(/\s+/g, ' ');
          }
          this._syncToStore();
        });
      });
    }

    _bindTimeSlots(dom) {
      const timeSlots = document.querySelectorAll(dom.timeChips || 'button[onclick*="selectTime"]');
      timeSlots.forEach(slot => {
        if (slot.__eyekart_bound) return;
        slot.__eyekart_bound = true;
        slot.addEventListener('click', () => {
          const match = slot.getAttribute('onclick')?.match(/selectTime\s*\(\s*this\s*,\s*['"]([^'"]+)['"]/);
          if (match) {
            this.selectedTime = match[1];
          } else {
            this.selectedTime = slot.textContent.trim();
          }
          this._syncToStore();
        });
      });
    }

    _syncToStore() {
      if (global.EyeKartStore && global.EyeKartStore.state) {
        if (!global.EyeKartStore.state.appointment) {
          global.EyeKartStore.state.appointment = {};
        }
        global.EyeKartStore.state.appointment.clinic = this.selectedClinic.name;
        global.EyeKartStore.state.appointment.date = this.selectedDate;
        global.EyeKartStore.state.appointment.time = this.selectedTime;
        global.EyeKartStore._saveState();
      }
    }

    _bindBookingConfirmation(dom) {
      const confirmBtns = document.querySelectorAll(dom.confirmBookingBtn || 'button[onclick*="alert"]');
      confirmBtns.forEach(btn => {
        if (btn.__eyekart_bound) return;
        btn.__eyekart_bound = true;
        btn.addEventListener('click', () => {
          const nameInput = document.querySelector('input[name="patient_name"], input[placeholder*="Full Name" i]');
          const phoneInput = document.querySelector('input[name="patient_phone"], input[placeholder*="Phone" i], input[type="tel"]');

          const patientName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : 'Zawadi Kamau';
          const phone = phoneInput && phoneInput.value.trim() ? phoneInput.value.trim() : '+254 712 345 678';

          if (global.EyeKartStore) {
            global.EyeKartStore.bookAppointment({
              clinicId: this.selectedClinic.id,
              clinicName: this.selectedClinic.name,
              address: this.selectedClinic.address,
              date: this.selectedDate,
              time: this.selectedTime,
              optometrist: this.selectedOptometrist,
              patient: {
                name: patientName,
                phone: phone
              }
            });
          }
        });
      });
    }
  }

  global.EyeKartBooking = new BookingEngine();

})(typeof window !== 'undefined' ? window : this);
