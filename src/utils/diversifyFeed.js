const diversifyFeed = (posts, maxConsecutive = 2) => {
  const result = [];
  const buffer = [];
  let lastAuthorId = null;
  let consecutiveCount = 0;

  for (const post of posts) {
    const authorId = (post.author._id || post.author).toString();

    if (authorId === lastAuthorId) {
      consecutiveCount++;
    } else {
      consecutiveCount = 1;
      lastAuthorId = authorId;
    }

    if (consecutiveCount <= maxConsecutive) {
      result.push(post);
    } else {
      buffer.push(post);
    }
  }

  return [...result, ...buffer];
};

module.exports = diversifyFeed;
