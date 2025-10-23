import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Vérifier l'authentification
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Parser les paramètres (AJOUT de redirectUrl)
    const { email, villes, role, redirectUrl } = await req.json();
    const targetRole = role || 'invited';

    // Validation des paramètres
    if (!email || !villes || villes.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Email and at least one ville are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (targetRole !== 'invited' && targetRole !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Invalid role. Must be "invited" or "admin"' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Récupérer le profil de l'admin qui fait la demande
    const { data: adminProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, ville')
      .eq('id', user.id)
      .single();

    if (profileError || !adminProfile || adminProfile.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: only admins can invite users' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Parser les villes de l'admin
    let adminVilles = [];
    if (adminProfile.ville) {
      if (Array.isArray(adminProfile.ville)) {
        adminVilles = adminProfile.ville;
      } else if (typeof adminProfile.ville === 'string' && adminProfile.ville.startsWith('{')) {
        const content = adminProfile.ville.slice(1, -1);
        adminVilles = content ? content.split(',') : [];
      }
    }

    const isGlobalAdmin = adminVilles.includes('global');

    // Vérifier les permissions sur les villes
    if (!isGlobalAdmin) {
      const unauthorizedVilles = villes.filter((v) => !adminVilles.includes(v));
      if (unauthorizedVilles.length > 0) {
        return new Response(
          JSON.stringify({
            error: `Vous ne pouvez créer des utilisateurs que pour vos propres villes. Villes non autorisées : ${unauthorizedVilles.join(', ')}`
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Vérifier si l'utilisateur existe déjà
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
    const emailExists = existingUser?.users?.some((u) => u.email === email);
    if (emailExists) {
      return new Response(
        JSON.stringify({ error: 'A user with this email already exists' }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // ✅ SOLUTION: Créer l'utilisateur puis utiliser signInWithOtp comme pour magic link
    const inviteRedirectUrl = redirectUrl || 'https://grandsprojets.com';
    
    // Créer l'utilisateur sans email
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { 
        invited: true,
        invited_at: new Date().toISOString()
      }
    });

    if (createError || !newUser.user) {
      return new Response(
        JSON.stringify({
          error: `Failed to create user: ${createError?.message || 'Unknown error'}`
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('User created, sending OTP with redirect URL:', inviteRedirectUrl);

    // Créer ou mettre à jour le profil
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', newUser.user.id)
      .single();

    if (existingProfile) {
      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({
          role: targetRole,
          ville: villes
        })
        .eq('id', newUser.user.id);

      if (profileUpdateError) {
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        return new Response(
          JSON.stringify({
            error: `Failed to update profile: ${profileUpdateError.message}`
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    } else {
      const { error: profileInsertError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: newUser.user.id,
          role: targetRole,
          ville: villes
        });

      if (profileInsertError) {
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        return new Response(
          JSON.stringify({
            error: `Failed to create profile: ${profileInsertError.message}`
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Créer un client Supabase NON-ADMIN pour envoyer l'OTP
    // (le client admin ne respecte pas emailRedirectTo)
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? '';
    
    // Nettoyer l'URL pour éviter les doubles slashes
    const cleanRedirectUrl = (inviteRedirectUrl || 'https://grandsprojets.com').replace(/\/+$/, '');
    const finalRedirectUrl = `${cleanRedirectUrl}/login/?invitation=true`;
    
    console.log('Using anon key:', anonKey ? 'Present' : 'MISSING');
    console.log('Original redirect URL:', inviteRedirectUrl);
    console.log('Cleaned redirect URL:', cleanRedirectUrl);
    console.log('Final redirect URL:', finalRedirectUrl);
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      anonKey
    );

    // Envoyer l'OTP avec le bon redirectTo (comme signInWithOtp pour magic link)
    console.log('=== SENDING OTP ===');
    console.log('Email:', email);
    console.log('emailRedirectTo:', finalRedirectUrl);
    console.log('shouldCreateUser:', false);
    
    const { data: otpData, error: otpError } = await supabaseClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: finalRedirectUrl,
        shouldCreateUser: false
      }
    });

    console.log('=== OTP RESPONSE ===');
    console.log('Error:', otpError);
    console.log('Data:', JSON.stringify(otpData, null, 2));

    if (otpError) {
      console.error('❌ Failed to send OTP:', otpError.message);
      console.error('Full error:', JSON.stringify(otpError, null, 2));
    } else {
      console.log('✅ OTP sent successfully');
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          villes,
          role: targetRole
        },
        message: `Invitation sent to ${email} with role "${targetRole}".`
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Internal error',
        details: String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
