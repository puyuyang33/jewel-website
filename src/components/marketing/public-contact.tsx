import { getPublicSiteSettings } from "./public-content";

export async function PublicContactLink() {
  const result = await getPublicSiteSettings();
  if (!result.ok) {
    return (
      <span role="status">
        The published contact address is temporarily unavailable.
      </span>
    );
  }

  const email = result.data.settings.contactEmail;
  return <a href={`mailto:${email}`}>{email}</a>;
}
