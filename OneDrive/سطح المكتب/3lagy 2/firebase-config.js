// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDOCAbC123dEf456GhI789jKl012-MnO",
  authDomain: "elagy-df72d.firebaseapp.com",
  projectId: "elagy-df72d",
  storageBucket: "elagy-df72d.appspot.com",
  messagingSenderId: "1034033124225",
  appId: "1:1034033124225:web:d2a2a8c3b4b5a692e29c9c"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
const auth = firebase.auth();
const db = firebase.firestore();

// Export the auth and db instances for use in other files
export { auth, db };

// Helper function to initialize reCAPTCHA
export const initializeRecaptcha = (elementId) => {
    return new firebase.auth.RecaptchaVerifier(elementId, {
        'size': 'invisible',
        'callback': (response) => {
            console.log('reCAPTCHA verified');
        }
    });
};

// Helper function to send OTP
export const sendOTP = async (phoneNumber, recaptchaVerifier) => {
    try {
        const confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, recaptchaVerifier);
        return confirmationResult;
    } catch (error) {
        console.error('Error sending OTP:', error);
        throw error;
    }
};

// Helper function to verify OTP
export const verifyOTP = async (confirmationResult, otp) => {
    try {
        const result = await confirmationResult.confirm(otp);
        return result;
    } catch (error) {
        console.error('Error verifying OTP:', error);
        throw error;
    }
};

// Helper function to sign out
export const signOut = async () => {
    try {
        await auth.signOut();
    } catch (error) {
        console.error('Error signing out:', error);
        throw error;
    }
};

// Helper function to get current user
export const getCurrentUser = () => {
    return auth.currentUser;
};

// Helper function to check if user is logged in
export const isLoggedIn = () => {
    return !!auth.currentUser;
};

// Helper function to get user token
export const getUserToken = async () => {
    try {
        return await auth.currentUser?.getIdToken();
    } catch (error) {
        console.error('Error getting user token:', error);
        throw error;
    }
}; 