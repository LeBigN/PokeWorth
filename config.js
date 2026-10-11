/* Configuration publique du site (le même fichier peut être remplacé par environnement : dev / production).
   La clé « anon » de Supabase est PUBLIQUE par conception : elle ne donne accès à rien sans session utilisateur,
   les règles d'accès (RLS) de la base font foi. Ne JAMAIS mettre ici la clé « service_role » ni un secret Apple/Google.
   Tant que ces deux valeurs sont vides, la connexion est désactivée et la Web App fonctionne en mode local (sur l'appareil). */
window.PW_CONFIG = {
  supabaseUrl: "",      // ex. "https://abcdxyz.supabase.co"
  supabaseAnonKey: ""   // clé « anon / publishable » du projet
};
