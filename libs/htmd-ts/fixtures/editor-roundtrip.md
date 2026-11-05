# Roundtrip fixture

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

Normal. <a href="https://example.com/full" title="Full link" target="_self" rel="author" class="custom-link">link </a>next. <span style="color:#3b82f6">textStyle </span>next. <strong>bold </strong>next. <code>code </code>next. <em>italic </em>next. <s>strike </s>next. <mark style="background-color:#3b82f6">highlight </mark>next. <u>underline </u>next. <span style="color:#ef4444"><strong><em><mark style="background-color:#22c55e"><u>Mixed </u></mark></em></strong></span>\
After hard break.

Aligned left

Aligned center

Aligned right

Aligned justify

> Quoted text

- Bullet item

3. Ordered item

- [x] Completed task

---

```typescript
const example = "<em>literal</em>";
// :::chart stays code
```

> [!NOTE] info notice
> Notice body info

> [!TIP] success notice
> Notice body success

> [!WARNING] warning notice
> Notice body warning

> [!CAUTION] error notice
> Notice body error

![Roundtrip image](.images/roundtrip.png "Caption with trailing space ")

:::bookmark {url="https://example.com/bookmark" title="Bookmark title" description="Bookmark description" image="https://images.example.com/bookmark.png" favicon="https://images.example.com/favicon.png" provider="Example" type="bookmark"} :::

:::youtube {url="https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;t=90" description="Embed description" provider="YouTube"} :::

Mentions: [mention id="post-123" label="Linked article" type="post" seriesId="series-456"] and [url-mention url="https://example.com/mention" title="URL mention" favicon="https://images.example.com/favicon.png"]

End of full fixture.

:::chart
{"series":[1,2]}
:::

Inline :future[raw] text.
