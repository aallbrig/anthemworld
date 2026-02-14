// QR Code Widget for Footer
document.addEventListener('DOMContentLoaded', function() {
    const qrContainer = document.getElementById('qrcode-container');
    const currentUrlSpan = document.getElementById('current-url');
    
    if (qrContainer && typeof QRCode !== 'undefined') {
        // Clear any existing QR code
        qrContainer.innerHTML = '';
        
        // Get current page URL
        const currentUrl = window.location.href;
        
        // Update URL display
        if (currentUrlSpan) {
            currentUrlSpan.textContent = currentUrl;
        }
        
        // Generate QR code
        new QRCode(qrContainer, {
            text: currentUrl,
            width: 100,
            height: 100,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    }
});
