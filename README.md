# Our Buy List

A small, phone-friendly shared shopping list built with HTML, CSS, JavaScript,
and Firebase Firestore.

## Connect the shared list to Firebase

1. Open [Firebase Console](https://console.firebase.google.com/) and create a
   project. Google Analytics is not needed.
2. Open **Build > Firestore Database**, click **Create database**, choose a
   nearby location, and start in **Production mode**.
3. Open **Project settings**, scroll to **Your apps**, choose the Web icon
   (`</>`), and register the app. Firebase Hosting is not needed.
4. Copy the values from the shown `firebaseConfig` object into
   `firebase-config.js`.
5. In Firestore, open the **Rules** tab, replace its contents with
   `firestore.rules`, then click **Publish**.
6. Publish this folder with GitHub Pages.

When the app first opens, it creates a random private list address containing
`?list=...`. Share that full address with your wife. Both phones will then see
the same list update live.

Keep the full link private. Anyone with it can change the list.

## Publish with GitHub Pages

1. Create a GitHub repository and add the contents of this folder.
2. Open **Settings > Pages** in the repository.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)`, then save.

## Local fallback

Until Firebase is configured, or when Firebase cannot be reached, items are
saved in the current browser using `localStorage`.
