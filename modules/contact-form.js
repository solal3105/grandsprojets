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
  const backBtn = document.getElementById('contact-form-back');
  
  console.log('[ContactForm] Éléments DOM trouvés:', {
    contactForm: !!contactForm,
    contactSuccess: !!contactSuccess,
    contactError: !!contactError,
    closeBtn: !!closeBtn,
    backBtn: !!backBtn
  });
  const ctaButton = document.querySelector('.about-cta-button');
  const revealEmailBtn = document.getElementById('reveal-email-btn');
  const emailRevealed = document.getElementById('email-revealed');
  const emailCopyBtn = document.getElementById('email-copy-btn');

  // Fonction pour fermer la modale (compatible ModalManager et ModalHelper)
  function closeModal() {
    if (win.ModalManager) {
      win.ModalManager.close('contact-form-overlay');
    } else if (win.ModalHelper) {
      win.ModalHelper.close('contact-form-overlay');
    }
  }

  // Fonction pour ouvrir la modale (compatible ModalManager et ModalHelper)
  function openModal() {
    if (win.ModalManager) {
      win.ModalManager.open('contact-form-overlay');
    } else if (win.ModalHelper) {
      win.ModalHelper.open('contact-form-overlay');
    }
  }

  // Ouvrir la modale depuis le CTA
  if (ctaButton) {
    ctaButton.addEventListener('click', (e) => {
      e.preventDefault();
      if (win.ModalManager) {
        win.ModalManager?.close('about-overlay');
      }
      openModal();
    });
  }

  // Bouton retour
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      closeModal();
      if (win.ModalManager) {
        win.ModalManager?.open('about-overlay');
      }
      resetForm();
    });
  }

  // Fermer la modale
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeModal();
      resetForm();
    });
  }

  // Révéler l'email (protection anti-bot)
  if (revealEmailBtn && emailRevealed) {
    revealEmailBtn.addEventListener('click', () => {
      revealEmailBtn.style.display = 'none';
      emailRevealed.style.display = 'block';
    });
  }

  // Copier l'email
  if (emailCopyBtn) {
    emailCopyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText('solal.gendrin@gmail.com');
        emailCopyBtn.classList.add('copied');
        const icon = emailCopyBtn.querySelector('i');
        icon.className = 'fas fa-check';
        
        setTimeout(() => {
          emailCopyBtn.classList.remove('copied');
          icon.className = 'fas fa-copy';
        }, 2000);
      } catch (err) {
        console.error('Erreur copie:', err);
      }
    });
  }

  // Soumettre le formulaire
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('[ContactForm] Soumission du formulaire');
      
      const submitBtn = contactForm.querySelector('.form-submit-btn');
      const originalHTML = submitBtn.innerHTML;
      
      // Loading state
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Envoi en cours...</span>';
      
      try {
        // Obtenir le client Supabase
        const supabaseClient = getSupabaseClient();
        console.log('[ContactForm] Supabase client:', supabaseClient ? 'OK' : 'MANQUANT');
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
          message: formData.get('message'),
          referrer: formData.get('referrer') || null,
        };
        console.log('[ContactForm] Données du formulaire:', data);

        // 1. Insérer dans la DB
        const { data: insertedData, error: dbError } = await supabaseClient
          .from('contact_requests')
          .insert([data])
          .select()
          .single();

        if (dbError) {
          console.error('[ContactForm] Erreur DB:', dbError);
          throw dbError;
        }
        console.log('[ContactForm] Données insérées:', insertedData);

        // 2. Appeler l'Edge Function pour envoyer l'email
        console.log('[ContactForm] Appel Edge Function "clever-endpoint"...');
        const { error: emailError } = await supabaseClient.functions.invoke('clever-endpoint', {
          body: insertedData
        });

        if (emailError) {
          console.error('[ContactForm] Erreur Email:', emailError);
          // Continue quand même, la demande est en DB
        } else {
          console.log('[ContactForm] Email envoyé avec succès');
        }

        // Succès
        contactForm.style.display = 'none';
        contactSuccess.style.display = 'block';
        
        // Fermer après 3 secondes
        setTimeout(() => {
          closeModal();
          resetForm();
        }, 3000);

      } catch (error) {
        console.error('[ContactForm] Erreur complète:', error);
        contactForm.style.display = 'none';
        contactError.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
        console.log('[ContactForm] Fin du traitement');
      }
    });
  } else {
    console.error('[ContactForm] Formulaire #contact-form non trouvé');
  }

  function resetForm() {
    if (contactForm) {
      contactForm.reset();
      contactForm.style.display = 'block';
      contactSuccess.style.display = 'none';
      contactError.style.display = 'none';
    }
    // Réinitialiser l'état du bouton email
    if (revealEmailBtn && emailRevealed) {
      revealEmailBtn.style.display = 'inline-flex';
      emailRevealed.style.display = 'none';
    }
  }

})();
