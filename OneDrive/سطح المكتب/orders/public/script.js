document.getElementById('order-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Create overlay with spinner
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
        <div class="upload-status">
            <div class="spinner"></div>
            <p>Processing your order...</p>
        </div>
    `;
    document.body.appendChild(overlay);

    const formData = new FormData(e.target);
    
    try {
        const response = await fetch('/orders', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();
        
        if (!response.ok) {
            // Handle server-side validation errors
            const errorMessage = data.error?.message || 'Failed to submit order. Please try again.';
            const errorDetails = data.error?.details ? `Details: ${data.error.details.join(', ')}` : '';
            throw new Error(`${errorMessage} ${errorDetails}`);
        }

        // Success handling
        const orderNumber = data.orderId.toString().padStart(3, '0');
        document.getElementById('order-form').style.display = 'none';
        document.getElementById('confirmation').style.display = 'block';
        document.getElementById('order-number').textContent = orderNumber;

    } catch (error) {
        // Enhanced error reporting
        console.error('Submission error:', error);
        overlay.querySelector('.upload-status').innerHTML = `
            <div class="error-icon">!</div>
            <p>${error.message}</p>
            <button onclick="location.reload()">Try Again</button>
        `;
    } finally {
        // Auto-remove overlay after delay if not already handled
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        }, 5000);
    }
});