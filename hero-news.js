const API_BASE_URL = 'https://hacker-news.firebaseio.com/v0';
const content = document.getElementById('content');
const themeToggle = document.getElementById('themeToggle');
const loadMoreButton = document.getElementById('load-more');
const liveUpdateContainer = document.getElementById('live-update');
let currentTheme = 'light';
let currentPage = 0;
let lastPostId = null;
let currentPageType = 'stories';

function throttle(func, wait) {
let timeout = null;
let previous = 0;

return function (...args) {
const now = Date.now();
const remaining = wait - (now - previous);

if (remaining <= 0 || remaining > wait) {
if (timeout) {
  clearTimeout(timeout);
  timeout = null;
}
previous = now;
return func.apply(this, args);
} else if (!timeout) {
timeout = setTimeout(() => {
  previous = Date.now();
  timeout = null;
  func.apply(this, args);
}, remaining);
}
};
}


async function fetchItem(id) {
    const response = await axios.get(`${API_BASE_URL}/item/${id}.json`);
    return response.data;
}

const fetchStories = async (pageType) => {
let endpoint;
switch (pageType) {
case 'stories':
    endpoint = 'newstories';
    break;
case 'jobs':
    endpoint = 'jobstories';
    break;
case 'polls':
    endpoint = 'topstories'; // We'll filter for polls later
    break;
default:
    endpoint = 'newstories';
}

try {
const response = await fetch(`${API_BASE_URL}/${endpoint}.json`);

// Check if the response is OK (status code in the range 200-299)
if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
}

const storyIds = await response.json();

const start = currentPage * 20;
const end = start + 20;
const newPosts = await Promise.all(
    storyIds.slice(start, end).map(fetchItem)
);



if (pageType === 'polls') {
    return newPosts.filter(post => post.type === 'poll');
}

return newPosts;
} catch (error) {
console.error('Error fetching posts:', error);
return [];
}
};

const throttledFetchStories = throttle(fetchStories, 1000);

function createPostElement(post) {
    const postEl = document.createElement('article');
    postEl.className = 'post-card';
    postEl.innerHTML = `
        <h2><a href="${post.url}" class="post-link" target="_blank">${post.title}</a></h2>
        <div class="post-meta">
            by ${post.by} | ${new Date(post.time * 1000).toLocaleString()} | ${post.score} points
        </div>
        <a href="#" class="post-link" data-post-id="${post.id}">${post.descendants || 0} comments</a>
    `;
    return postEl;
}

function createCommentElement(comment, isNested = false) {
    const commentEl = document.createElement('div');
    commentEl.className = `comment ${isNested ? 'nested-comment' : ''}`;
    commentEl.innerHTML = `
        <div class="comment-meta">
            by ${comment.by} | ${new Date(comment.time * 1000).toLocaleString()}
        </div>
        <div>${comment.text}</div>
    `;
    return commentEl;
}

async function loadComments(postId) {
    const post = await fetchItem(postId);
    content.innerHTML = `
        <h2>${post.title}</h2>
        <div class="post-meta">
            by ${post.by} | ${new Date(post.time * 1000).toLocaleString()} | ${post.score} points
        </div>
        <div class="comments" id="comments"></div>
    `;

    const commentsContainer = document.getElementById('comments');

    async function loadComment(commentId, container, isNested = false) {
        const comment = await fetchItem(commentId);
        if (comment && !comment.deleted) {
            const commentEl = createCommentElement(comment, isNested);
            container.appendChild(commentEl);

            if (comment.kids) {
                for (const childId of comment.kids) {
                    await loadComment(childId, commentEl, true);
                }
            }
        }
    }

    if (post.kids) {
        for (const commentId of post.kids) {
            await loadComment(commentId, commentsContainer);
        }
    }
}

async function loadPosts(pageType) {
    const posts = await throttledFetchStories(pageType);
    
    if (currentPage === 0) {
        content.innerHTML = `<h2>${pageType.charAt(0).toUpperCase() + pageType.slice(1)}</h2>`;
    }
    posts.forEach(post => {
        const postEl = createPostElement(post);
        content.appendChild(postEl);
    });
    currentPage++;

    if (posts.length > 0) {
        lastPostId = posts[0].id;
    }

    loadMoreButton.style.display = posts.length === 20 ? 'block' : 'none';
}

const checkForUpdates = throttle(async () => {
    try {
        const response = await axios.get(`${API_BASE_URL}/newstories.json`);
        const latestStories = response.data;
        const latestStory = await fetchItem(latestStories[0]);
        if (latestStory.id !== lastPostId) {
            liveUpdateContainer.textContent = `New story: ${latestStory.title} - by ${latestStory.by}`;
            liveUpdateContainer.style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking for updates:', error);
    }
}, 5000);

// Handle navigation
document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = e.target.dataset.page;
        currentPageType = page;
        currentPage = 0;
        content.innerHTML = '';
        loadPosts(page);
    });
});

// Handle comment links
document.addEventListener('click', (e) => {
    if (e.target.matches('a[data-post-id]')) {
        e.preventDefault();
        const postId = e.target.dataset.postId;
        loadComments(postId);
    }
});

// Theme toggle
themeToggle.addEventListener('click', () => {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', currentTheme);
});

// Load More button
loadMoreButton.addEventListener('click', () => loadPosts(currentPageType));

// Initial load
loadPosts('stories');

// Check for updates every 5 seconds
setInterval(checkForUpdates, 5000);