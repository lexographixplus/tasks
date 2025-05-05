// firebase-config.js
// Import necessary functions from the Firebase SDK (using version 11.6.1)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// Consider adding getAnalytics if you want to use Firebase Analytics
// import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

// Your web app's Firebase configuration (REPLACED with your provided values)
const firebaseConfig = {
  apiKey: "AIzaSyDrjGx0PRC4ST72Jis0IZA8xCnCLpBszOU", // Use your actual key
  authDomain: "lexotasks-manager.firebaseapp.com",
  projectId: "lexotasks-manager",
  storageBucket: "lexotasks-manager.appspot.com", // Corrected potential typo: .appspot.com is common
  messagingSenderId: "873763081325",
  appId: "1:873763081325:web:c2359d5d86f6af718b4364"
  // measurementId: "YOUR_MEASUREMENT_ID" // Optional: Add if you plan to use Analytics
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app); // Firebase Authentication service
const db = getFirestore(app); // Cloud Firestore service
// const analytics = getAnalytics(app); // Optional: Firebase Analytics service

// Export the initialized services to be used in other parts of your application
export { app, auth, db };
