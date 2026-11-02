/* Configuration publique du site (le même fichier peut être remplacé par environnement : dev / production).
   La clé « anon » de Supabase est PUBLIQUE par conception : elle ne donne accès à rien sans session utilisateur,
   les règles d'accès (RLS) de la base font foi. Ne JAMAIS mettre ici la clé « service_role » ni un secret Apple/Google.
   Tant que supabaseUrl et supabaseAnonKey sont vides, la connexion est désactivée et la Web App fonctionne en mode local (sur l'appareil). */
window.PW_CONFIG = {
  supabaseUrl: "",      // ex. "https://abcdxyz.supabase.co"
  supabaseAnonKey: "",  // clé « anon / publishable » du projet
  /* Méthodes de connexion affichées : passez à true UNIQUEMENT celles qui sont activées dans Supabase (Authentication > Providers).
     Un bouton n'apparaît jamais pour un service qui n'est pas configuré. */
  providers: { email: true, google: false, apple: false },
  /* Connexion par QR code : non développée (elle exige un jeton à usage unique, une expiration courte et une confirmation
     depuis l'app iPhone, qui n'est pas encore publiée). Laisser false : aucun QR n'est affiché. */
  qrLogin: false
};
