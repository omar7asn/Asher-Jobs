document.addEventListener('DOMContentLoaded', function() {
    emailjs.init("yvyWUXDs0LQX_4Pbq"); // Initialize EmailJS with your User ID

    const passwordForm = document.getElementById('passwordForm');
    const otpForm = document.getElementById('otpForm');
    const otpInputs = document.querySelectorAll('.input-box2 input[type="number"]');
    const errorMessage = document.getElementById('error-message');
    let generatedOTP = '';
    let otpSent = false; // Flag to check if OTP is already sent

    passwordForm.addEventListener('submit', function(event) {
        event.preventDefault(); // Prevent form submission
        validatePasswords();
    });

    otpForm.addEventListener('submit', function(event) {
        event.preventDefault(); // Prevent form submission
        verifyOTP();
    });

    otpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            handleOTPInput(e, index);
        });

        input.addEventListener('keydown', (e) => {
            handleOTPKeydown(e, index);
        });
    });

    function validatePasswords() {
        const password1 = document.getElementById('password1').value;
        const password2 = document.getElementById('password2').value;
        const email = document.getElementById('email').value;

        if (password1 !== password2) {
            errorMessage.classList.remove('hidden');
        } else {
            errorMessage.classList.add('hidden');
            if (!otpSent) { // Only send OTP if it hasn't been sent
                sendOTP(email);
            }
        }
    }

    function sendOTP(email) {
        // Check if OTP has already been generated and sent
        if (otpSent) {
            console.log('OTP already generated and sent:', generatedOTP);
            return;
        }

        // Generate a 4-digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000);
        generatedOTP = otp.toString();

        // Set up the parameters for EmailJS
        const templateParams = {
            to_email: email,
            otp: generatedOTP
        };

        // Send the OTP via EmailJS
        emailjs.send('service_wovyjzm', 'template_zkht55u', templateParams)
            .then(function(response) {
                console.log('SUCCESS!', response.status, response.text);
                toggleForms();
                otpSent = true; // Set flag to true once OTP is sent
            }, function(error) {
                console.log('FAILED...', error);
                generatedOTP = ''; // Reset OTP in case of failure
                otpSent = false; // Allow OTP to be sent again in case of failure
            });
    }

    function handleOTPInput(e, index) {
        if (e.target.value.length > 1) {
            e.target.value = e.target.value.slice(0, 1);
        }

        if (e.target.value !== '' && index < otpInputs.length - 1) {
            otpInputs[index + 1].focus();
        }
    }

    function handleOTPKeydown(e, index) {
        if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
            otpInputs[index - 1].focus();
        }
    }

    function toggleForms() {
        document.querySelector('.wrapper').classList.add('hidden');
        document.querySelector('.wrapper2').classList.remove('hidden');
    }

    function verifyOTP() {
        let enteredOTP = '';
        otpInputs.forEach(input => enteredOTP += input.value);

        if (enteredOTP === generatedOTP) {
            alert('OTP verified successfully!');
            // Redirect to the desired page or perform the next steps here
        } else {
            alert('Invalid OTP. Please try again.');
        }
    }
});
