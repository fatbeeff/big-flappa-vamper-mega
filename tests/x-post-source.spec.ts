import { expect, test } from "./support/extension-harness";

test("shows the per-post client supplied by X without treating it as hardware proof", async ({ extension }) => {
  const postId = "2093500169723814093";
  const page = await extension.openXPost(`<!doctype html><html><body>
    <a href="/kevin_t_ngo/status/${postId}"><time>Aug 29</time></a>
    <script>fetch("https://x.com/i/api/graphql/current/TweetResultByRestId?variables=test")</script>
  </body></html>`, `https://x.com/kevin_t_ngo/status/${postId}`, {
    data: { tweetResult: { result: {
      rest_id: postId,
      source: '<a href="https://mobile.twitter.com" rel="nofollow">Twitter Web App</a>',
    } } },
  });

  const source = page.locator(`[data-vamp-post-source="${postId}"]`);
  await expect(source).toHaveText(" · Twitter Web App");
  await expect(source).toHaveAttribute("href", "https://mobile.twitter.com/");
  await expect(source).toHaveAttribute("title", /not physical-device proof/i);
});
