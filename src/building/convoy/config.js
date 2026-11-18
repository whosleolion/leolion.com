// Convoy connection settings.
// Leave FIREBASE_DB_URL empty to run in LOCAL mode (data stays in this browser,
// synced between its tabs only: fine for trying things out, useless for a real night).
// To go live: create a Firebase project, add a Realtime Database, paste its URL here
// (looks like https://your-project-default-rtdb.firebaseio.com), and publish the rules
// in tools/convoy/firebase-rules.json. See tools/convoy/README.md.
export const FIREBASE_DB_URL = 'https://convoy-backend-default-rtdb.firebaseio.com';
