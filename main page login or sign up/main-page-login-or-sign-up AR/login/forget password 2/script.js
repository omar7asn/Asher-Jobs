document.addEventListener('DOMContentLoaded', function() {
    const passwordForm = document.getElementById('passwordForm');
    const errorMessage = document.getElementById('error-message');

    passwordForm.addEventListener('submit', function(event) {
        event.preventDefault(); // Prevent form submission
        validatePasswords();
    });

    function validatePasswords() {
        const password1 = document.getElementById('password1').value;
        const password2 = document.getElementById('password2').value;

        if (password1 !== password2) {
            errorMessage.classList.remove('hidden');
        } else {
            errorMessage.classList.add('hidden');
            // Here you can add the logic to update the password in your backend
            alert('Password reset successfully!');
        }
    }
});
