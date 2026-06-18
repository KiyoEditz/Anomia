import { Link } from 'react-router-dom';

export default function TagPill({ tag }) {
  return (
    <Link to={`/tag/${tag.slug}`} className={`tag ${tag.category}`}>
      {tag.name}
    </Link>
  );
}
