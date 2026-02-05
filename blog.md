Code is unforgiving. It either works or it doesn't. No hand-waving, no "you know what I mean," no close enough. This is what makes programming frustrating—and what makes programmers valuable.

## The gap between "works" and "works correctly"

Storing passwords in plaintext works. Validating user input only on the frontend works. Hardcoding API keys in your public endpoint works. Ship any of these and your app will function—until it doesn't, spectacularly.

Out of all the ways something appears to work, only a narrow subset actually works correctly. Finding your way to that subset is the job.

![Corn maze: tiny "works correctly" center, small "works" ring around it, vast unmarked paths for everything else](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/glr6t8z5se8zrsjyd6lf.png)


A manager can say "make it work." A PM can wave their hands at a spec. But the developer can't—the programming language won't let them. They have to fight until the code actually works—not just appears to.

For decades, this asymmetry was just how software got built. Then came agents.

## Agents: finally, relief

AI coding agents flip this dynamic. Suddenly, *you* can hand-wave. You can say "make it work" and often... it does. Write me a function that does X. Hook up this API. Fix this bug.

This is a real relief. No more battling a machine that only understands formal syntax. You can finally speak in human terms. The friction is gone.

But when the agent produces code that runs, you can't tell from the output whether it's correct or just appears to work. That distinction lives in the code itself—how the API key is stored, whether validation happens server-side, how errors are handled.

I ran into this recently. I asked an agent to migrate our hand-rolled API call logic to react-query. We had a mix—some places already used react-query, others had hand-crafted code that was essentially a poor imitation of it. The agent did a great job, except in one place where it chose [useMutation](https://tanstack.com/query/v5/docs/framework/react/guides/mutations) instead of [useQuery](https://tanstack.com/query/v5/docs/framework/react/guides/queries).

In its defense: it was a borderline case. There was a minor side effect on the server. But the main point of the call was fetching a token for later use, and it happened on mount—not in response to user action, which is `useMutation`'s typical pattern.

Weird things started happening in dev. React's StrictMode double-mounts components, and the mutation fired twice—but the backend refused to generate a second token, so we'd get errors. A dev-only problem, sure—but it seriously slowed us down while we hunted for the cause.

We asked agents to debug it. They spotted the StrictMode double-mount but kept trying to make `useMutation` work—patching the symptom, not questioning the choice. Only by reading the code did I see the real fix: this should have been `useQuery` all along. Once I switched it, the problems vanished.

![Code diff showing useMutation replaced with useQuery—the one fix that solved the problem](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/h34yxjtk5yf4wpk2u4kr.png)

The agent had done exactly what I asked across dozens of call sites. It got one wrong—in a way that was hard to see and hard to debug, because the choice wasn't crazy. It was just incorrect for reasons that required knowing the full context.

## Pulled back in

So we're not free from the code. Disengaging from it lands us right in "appears to work" territory.

And now it's arguably harder: reading code is often harder than writing it. Especially code you didn't write, shaped by patterns you didn't choose, solving the problem in ways you didn't anticipate.

Agents are often hailed as a way out of the messy coding layer. But [just when you think you're out](https://www.youtube.com/watch?v=UPw-3e_pzqU), the code pulls you back in. Turns out, they merely shift your work from writing to reviewing.

And reviewing at the pace agents write takes practice. There's a craft to it—one worth developing.
