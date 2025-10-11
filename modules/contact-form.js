/**
 * Contact Form Module
 * Gère le formulaire de contact et l'envoi via Supabase
 */

(function() {
  'use strict';

  const win = window;
  
  // Fonction pour obtenir le client Supabase
  function getSupabaseClient() {
    // Essayer AuthModule d'abord
    if (win.AuthModule && typeof win.AuthModule.getClient === 'function') {
      return win.AuthModule.getClient();
    }
    // Fallback sur window.supabase si disponible
    if (win.supabase) {
      return win.supabase;
    }
    console.error('[ContactForm] Supabase client not available');
    return null;
  }
  
  // Éléments DOM
  const contactForm = document.getElementById('contact-form');
  const contactSuccess = document.getElementById('contact-success');
  const contactError = document.getElementById('contact-error');
  const closeBtn = document.getElementById('contact-form-close');
  const ctaButton = document.querySelector('.about-cta-button');

  // Ouvrir la modale depuis le CTA
  if (ctaButton) {
    ctaButton.addEventListener('click', (e) => {
      e.preventDefault();
      win.ModalManager?.close('about-overlay');
      win.ModalManager?.open('contact-form-overlay');
    });
  }

  // Fermer la modale
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      win.ModalManager?.close('contact-form-overlay');
      resetForm();
    });
  }

  // Soumettre le formulaire
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = contactForm.querySelector('.form-submit-btn');
      const originalHTML = submitBtn.innerHTML;
      
      // Loading state
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Envoi en cours...</span>';
      
      try {
        // Obtenir le client Supabase
        const supabaseClient = getSupabaseClient();
        if (!supabaseClient) {
          throw new Error('Supabase client not available');
        }

        // Récupérer les données
        const formData = new FormData(contactForm);
        const data = {
          full_name: formData.get('full_name'),
          email: formData.get('email'),
          phone: formData.get('phone') || null,
          organization: formData.get('organization'),
          organization_type: formData.get('organization_type'),
          message: formData.get('message'),
          referrer: formData.get('referrer') || null,
        };

        // 1. Insérer dans la DB
        const { data: insertedData, error: dbError } = await supabaseClient
          .from('contact_requests')
          .insert([data])
          .select()
          .single();

        if (dbError) throw dbError;

        // 2. Appeler l'Edge Function pour envoyer l'email
        const { error: emailError } = await supabaseClient.functions.invoke('clever-endpoint', {
          body: insertedData
        });

        if (emailError) {
          console.error('Email error:', emailError);
          // Continue quand même, la demande est en DB
        }

        // Succès
        contactForm.style.display = 'none';
        contactSuccess.style.display = 'block';
        
        // Fermer après 3 secondes
        setTimeout(() => {
          win.ModalManager?.close('contact-form-overlay');
          resetForm();
        }, 3000);

      } catch (error) {
        console.error('Error:', error);
        contactForm.style.display = 'none';
        contactError.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
      }
    });
  }

  function resetForm() {
    if (contactForm) {
      contactForm.reset();
      contactForm.style.display = 'block';
      contactSuccess.style.display = 'none';
      contactError.style.display = 'none';
    }
  }

})();
