document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        openPopupButton: document.getElementById('openPopupButton'),
        postPopup: document.getElementById('postPopup'),
        closePopupButton: document.getElementById('closePopupButton'),
        postButton: document.getElementById('postButton'),
        postsContainer: document.getElementById('postsContainer'),
        imageUploadButton: document.getElementById('imageUploadButton'),
        imageInput: document.getElementById('imageInput'),
        imagePreview: document.getElementById('imagePreview'),
        deleteImageButton: document.getElementById('deleteImageButton'),
        postContent: document.getElementById('postContent')
    };

    let imageFile = null;

    function togglePopup(display) {
        elements.postPopup.style.display = display;
        elements.openPopupButton.style.display = display === 'block' ? 'none' : 'block';
    }

    function handleImageUpload() {
        elements.imageInput.click();
    }

    function handleImageChange(event) {
        const file = event.target.files[0];
        if (file) {
            imageFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                elements.imagePreview.src = e.target.result;
                elements.imagePreview.style.display = 'block';
                elements.deleteImageButton.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    }

    function handleImageDelete() {
        imageFile = null;
        elements.imagePreview.src = '';
        elements.imagePreview.style.display = 'none';
        elements.deleteImageButton.style.display = 'none';
        elements.imageInput.value = '';
    }

    function createPostElement(postContent) {
        const post = document.createElement('div');
        post.classList.add('post');

        const postHeader = createPostHeader();
        post.appendChild(postHeader);

        const postText = document.createElement('div');
        postText.classList.add('post-text');
        postText.textContent = postContent;
        post.appendChild(postText);

        if (imageFile) {
            const postImage = document.createElement('img');
            postImage.src = URL.createObjectURL(imageFile);
            post.appendChild(postImage);
        }

        post.appendChild(createButtonContainer('agree'));
        post.appendChild(createButtonContainer('disagree'));

        return post;
    }

    function createPostHeader() {
        const postHeader = document.createElement('div');
        postHeader.classList.add('post-header');

        const profilePicture = document.createElement('img');
        profilePicture.src = 'path-to-profile-picture.jpg'; // Replace with actual path

        const postInfo = document.createElement('div');
        postInfo.classList.add('post-info');
        postInfo.innerHTML = `
            <div class="name">User Name</div>
            <div class="timestamp">${new Date().toLocaleString()}</div>
        `;

        const postMenu = document.createElement('div');
        postMenu.classList.add('post-menu');
        postMenu.innerHTML = `
            <i class="bx bx-dots-horizontal-rounded"></i>
            <div class="menu-content">
                <a href="#" class="delete-post">Delete Post</a>
            </div>
        `;

        postHeader.appendChild(profilePicture);
        postHeader.appendChild(postInfo);
        postHeader.appendChild(postMenu);

        postMenu.addEventListener('click', () => postMenu.classList.toggle('active'));

        return postHeader;
    }

    function createButtonContainer(type) {
        const container = document.createElement('div');
        container.classList.add(`${type}-button-container`);

        const button = document.createElement('button');
        button.classList.add(`${type}-button`);
        button.innerHTML = `<i class="bx bx-${type === 'agree' ? 'like' : 'dislike'}"></i> ${type.charAt(0).toUpperCase() + type.slice(1)}`;

        const counter = document.createElement('div');
        counter.classList.add('counter');
        counter.textContent = '0';

        button.addEventListener('click', (event) => handleButtonClick(event, type));

        container.appendChild(button);
        container.appendChild(counter);

        return container;
    }

    function handleButtonClick(event, type) {
        const button = event.target.closest('button');
        const counter = button.nextElementSibling;
        const post = button.closest('.post');
        const oppositeType = type === 'agree' ? 'disagree' : 'agree';
        const oppositeButton = post.querySelector(`.${oppositeType}-button`);
        const oppositeCounter = oppositeButton.nextElementSibling;

        if (button.classList.contains('active')) {
            button.classList.remove('active');
            counter.textContent = parseInt(counter.textContent) - 1;
        } else {
            button.classList.add('active');
            counter.textContent = parseInt(counter.textContent) + 1;

            if (oppositeButton.classList.contains('active')) {
                oppositeButton.classList.remove('active');
                oppositeCounter.textContent = parseInt(oppositeCounter.textContent) - 1;
            }
        }
    }

    function resetPopup() {
        elements.postContent.value = '';
        imageFile = null;
        elements.imagePreview.src = '';
        elements.imagePreview.style.display = 'none';
        elements.deleteImageButton.style.display = 'none';
        elements.imageInput.value = '';
    }

    elements.openPopupButton.addEventListener('click', () => togglePopup('block'));
    elements.closePopupButton.addEventListener('click', () => {
        togglePopup('none');
        resetPopup();
    });
    elements.imageUploadButton.addEventListener('click', handleImageUpload);
    elements.imageInput.addEventListener('change', handleImageChange);
    elements.deleteImageButton.addEventListener('click', handleImageDelete);

    elements.postButton.addEventListener('click', () => {
        const postContent = elements.postContent.value;
        const post = createPostElement(postContent);

        elements.postsContainer.insertBefore(post, elements.postsContainer.firstChild);

        togglePopup('none');
        resetPopup();
    });

    elements.postsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-post')) {
            const post = event.target.closest('.post');
            post.remove();
        }
    });
});
