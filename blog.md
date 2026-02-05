# Just When I Thought I Was Out, The Code Pulls Me Back In


Code is unforgiving. It either works or it doesn't. No hand-waving, no "you know what I mean," no close enough. This is what makes programming frustrating—and what makes programmers valuable.

## The gap between "works" and "works correctly"

Storing passwords in plaintext works. Validating user input only on the frontend works. Hardcoding API keys in your public endpoint works. Ship any of these and your app will function—until it doesn't, spectacularly.

Out of all the ways something can seemingly work, only a narrow subset actually works correctly. Finding that subset is the job.

A manager can say "make it work." A PM can wave their hands at a spec. But the developer can't—the programming language won't let them. They have to fight it until the code lands in "works correctly," not just "works."


## Agents: finally, relief

AI coding agents flip this dynamic. Suddenly, *you* can hand-wave. You can say "make it work" and often... it does. Write me a function that does X. Hook up this API. Fix this bug.

This is a real relief. No more battling a machine that only understands formal syntax. You can finally speak in broad human terms. The friction is gone.

But when the agent produces code that runs, you can't tell from the output whether it's correct or just seemingly working. That distinction lives in the code itself—how the API key is stored, whether validation happens server-side, how errors are handled.

Here's what this looks like in practice.

I asked an agent to migrate our hand-rolled API call logic to react-query. We had a mix—some places already used react-query, others had hand-crafted code that was essentially a poor imitation of it. The agent did a great job, except in one place where it chose `useMutation` instead of `useQuery`.

In its defense: it was a borderline case. There was a minor side effect on the server. But the main point of the call was fetching a token for later use, and it happened on mount—not in response to user action, which is `useMutation`'s typical pattern.

Weird things started happening. It took us a while to trace it back. Once we switched to `useQuery`, the problems vanished immediately.

The agent had done exactly what I asked across dozens of call sites. It got one wrong. And that one was wrong in a way that was hard to see and hard to debug, because the choice wasn't crazy—it was just incorrect for reasons that required knowing the full context.


## Pulled back in

So we're not free from the code. Disengaging from it lands us right in "seemingly working" territory.

And now it's arguably harder: reading code is often harder than writing it. Especially code you didn't write, shaped by patterns you didn't choose, solving the problem in ways you didn't anticipate.

Agents are often hailed as a way out. They delivered a shift: from writing to reviewing. But reviewing is still being in the code. There's no escaping it.

The only lever you have is making it less to read. Small chunks. Frequent review. The agent writes; you stay close. But that's not freedom—it's just the new shape of the work.