/**
 * The registry of everything the admin portal can edit.
 *
 * Each entry pairs a schema (which drives both the editor UI and server-side
 * validation) with the JSON file that ships in the repository as its default.
 */
import clubInfoDefaults from "../../data/clubInfo.json";
import eventsDefaults from "../../data/events.json";
import fundraisingDefaults from "../../data/fundraising.json";
import memberAnnouncementsDefaults from "../../data/memberAnnouncements.json";
import memberResourcesDefaults from "../../data/memberResources.json";
import redirectsDefaults from "../../data/redirects.json";
import sponsorsDefaults from "../../data/sponsors.json";
import {
  normalizeCollection,
  type ClientCollectionSpec,
  type CollectionSpec,
} from "./fieldSpec";

export {
  emptyListItem,
  emptyValueForField,
  formatFieldPath,
  normalizeCollection,
  validateCollection,
} from "./fieldSpec";

export type {
  ClientCollectionSpec,
  CollectionScope,
  CollectionSpec,
  FieldMap,
  FieldSpec,
  ListFieldSpec,
  ObjectFieldSpec,
  ValidationIssue,
  ValidationResult,
} from "./fieldSpec";

const SLUG_PATTERN = "^[a-z0-9]+(?:-[a-z0-9]+)*$";

const EVENT_TYPE_OPTIONS = [
  "fundraiser",
  "race",
  "sports",
  "gaming",
  "tournament",
  "dine-to-donate",
  "meeting",
  "community",
];

const SPONSOR_TIER_OPTIONS = ["Platinum", "Gold", "Silver", "Bronze"];

export const CONTENT_COLLECTIONS: Record<string, CollectionSpec> = {
  fundraising: {
    id: "fundraising",
    label: "Fundraising totals",
    description:
      "Running total, yearly goal, past-year history, and the DonorDrive link.",
    icon: "heart",
    scope: "public",
    previewPath: "/fundraising",
    defaults: fundraisingDefaults,
    notes: [
      "The progress bar on the home page uses the current total and goal.",
    ],
    root: {
      kind: "object",
      label: "Fundraising",
      fields: {
        currentYear: {
          kind: "number",
          label: "Current campaign year",
          integer: true,
          required: true,
          min: 2000,
          max: 2100,
        },
        currentTotal: {
          kind: "number",
          label: "Raised so far",
          required: true,
          min: 0,
          step: 0.01,
          prefix: "$",
          help: "Update this as donations come in.",
        },
        goalTotal: {
          kind: "number",
          label: "Goal for this year",
          required: true,
          min: 1,
          step: 0.01,
          prefix: "$",
        },
        donorDriveLink: {
          kind: "url",
          label: "DonorDrive donation link",
          required: true,
          placeholder: "https://fourdiamonds.donordrive.com/GMHSMT",
        },
        history: {
          kind: "list",
          label: "Previous years",
          itemLabel: "Year",
          titleField: "year",
          uniqueBy: "year",
          fields: {
            year: {
              kind: "number",
              label: "Year",
              integer: true,
              required: true,
              min: 2000,
              max: 2100,
            },
            total: {
              kind: "number",
              label: "Total raised",
              required: true,
              min: 0,
              step: 0.01,
              prefix: "$",
            },
          },
        },
      },
    },
  },
  sponsors: {
    id: "sponsors",
    label: "Sponsors",
    description: "Sponsor names, tiers, logos, and websites.",
    icon: "users",
    scope: "public",
    previewPath: "/sponsors",
    defaults: sponsorsDefaults,
    notes: ["Logos uploaded here are stored on UploadThing."],
    root: {
      kind: "object",
      label: "Sponsors",
      fields: {
        sponsors: {
          kind: "list",
          label: "Sponsors",
          itemLabel: "Sponsor",
          titleField: "name",
          subtitleField: "tier",
          uniqueBy: "name",
          fields: {
            name: { kind: "text", label: "Name", required: true },
            tier: {
              kind: "select",
              label: "Tier",
              options: SPONSOR_TIER_OPTIONS,
              required: true,
            },
            logo: {
              kind: "image",
              label: "Logo",
              help: "Upload an image or paste an https:// link.",
            },
            website: { kind: "url", label: "Website" },
          },
        },
      },
    },
  },
  events: {
    id: "events",
    label: "Events",
    description:
      "Events published to the site, including members-only notes for each one.",
    icon: "calendar",
    scope: "public",
    previewPath: "/events",
    defaults: eventsDefaults,
    notes: [
      "Events kept in the repository as .mdx files still work and are listed alongside these.",
      "Each event gets its own page at /events/<slug>.",
    ],
    root: {
      kind: "object",
      label: "Events",
      fields: {
        events: {
          kind: "list",
          label: "Events",
          itemLabel: "Event",
          titleField: "title",
          subtitleField: "date",
          uniqueBy: "slug",
          fields: {
            title: { kind: "text", label: "Title", required: true },
            slug: {
              kind: "text",
              label: "URL slug",
              required: true,
              pattern: SLUG_PATTERN,
              patternMessage:
                "Use lowercase letters, numbers, and hyphens (for example: bake-sale).",
              placeholder: "bake-sale",
              help: "The event page will be at /events/<slug>.",
            },
            date: { kind: "date", label: "Date", required: true },
            time: {
              kind: "text",
              label: "Start time",
              placeholder: "6:30 PM",
              help: "Optional. Examples: 6:30 PM or 18:30.",
            },
            location: { kind: "text", label: "Location" },
            event_type: {
              kind: "select",
              label: "Event type",
              options: EVENT_TYPE_OPTIONS,
              required: true,
              allowOther: true,
            },
            summary: {
              kind: "textarea",
              label: "Summary",
              required: true,
              rows: 2,
              help: "One or two lines shown on the events list.",
            },
            description: {
              kind: "markdown",
              label: "Public description",
              rows: 8,
            },
            image: {
              kind: "image",
              label: "Flyer or photo",
              help: "Optional. Shown under the description on the event page.",
            },
            embedUrl: {
              kind: "embed",
              label: "Video embed",
              help: "Optional. A YouTube, Vimeo, or Google Drive share link.",
            },
            memberDetails: {
              kind: "markdown",
              label: "Members-only notes",
              rows: 6,
              help: "Only visible to signed-in members on the event page.",
            },
            links: {
              kind: "stringList",
              label: "Related links",
              itemLabel: "Link",
              itemKind: "url",
            },
            published: {
              kind: "boolean",
              label: "Published",
              help: "Unpublished events stay hidden from the site.",
            },
          },
        },
      },
    },
  },
  clubInfo: {
    id: "clubInfo",
    label: "Club info",
    description:
      "Mission, about text, officers, meeting times, social links, and contact email.",
    icon: "building",
    scope: "public",
    previewPath: "/about",
    defaults: clubInfoDefaults,
    root: {
      kind: "object",
      label: "Club info",
      fields: {
        mission: {
          kind: "stringList",
          label: "Mission statement",
          itemLabel: "Paragraph",
          itemKind: "textarea",
        },
        about: {
          kind: "stringList",
          label: "About the club",
          itemLabel: "Paragraph",
          itemKind: "textarea",
        },
        aboutContinued: {
          kind: "stringList",
          label: "About — continued",
          itemLabel: "Paragraph",
          itemKind: "textarea",
          help: "Shown lower on the about page.",
        },
        meetings: {
          kind: "object",
          label: "Meeting times",
          fields: {
            general: { kind: "text", label: "General meetings" },
            board: { kind: "text", label: "Board meetings" },
          },
        },
        socialMedia: {
          kind: "object",
          label: "Social media",
          help: "Full links, or a short note where there is no link.",
          fields: {
            instagram: { kind: "text", label: "Instagram" },
            groupme: { kind: "text", label: "GroupMe" },
            facebook: { kind: "text", label: "Facebook" },
            tiktok: { kind: "text", label: "TikTok" },
          },
        },
        officers: {
          kind: "list",
          label: "Officers",
          itemLabel: "Officer",
          titleField: "name",
          subtitleField: "role",
          fields: {
            role: { kind: "text", label: "Role", required: true },
            name: { kind: "text", label: "Name", required: true },
            email: { kind: "email", label: "Email" },
          },
        },
        contact: {
          kind: "object",
          label: "Contact",
          fields: {
            email: { kind: "email", label: "Public contact email" },
          },
        },
      },
    },
  },
  redirects: {
    id: "redirects",
    label: "Short links",
    description:
      "Short URLs such as /redirect/donate that point somewhere else.",
    icon: "link",
    scope: "public",
    defaults: redirectsDefaults,
    root: {
      kind: "list",
      label: "Short links",
      itemLabel: "Short link",
      titleField: "slug",
      subtitleField: "label",
      uniqueBy: "slug",
      fields: {
        slug: {
          kind: "text",
          label: "Slug",
          required: true,
          pattern: SLUG_PATTERN,
          patternMessage:
            "Use lowercase letters, numbers, and hyphens (for example: spring-5k).",
          help: "Creates /redirect/<slug>.",
        },
        label: { kind: "text", label: "Label", required: true },
        url: { kind: "url", label: "Destination URL", required: true },
      },
    },
  },
  memberAnnouncements: {
    id: "memberAnnouncements",
    label: "Member announcements",
    description: "Announcements shown in the member portal.",
    icon: "megaphone",
    scope: "members",
    previewPath: "/members/announcements",
    defaults: memberAnnouncementsDefaults,
    root: {
      kind: "object",
      label: "Announcements",
      fields: {
        announcements: {
          kind: "list",
          label: "Announcements",
          itemLabel: "Announcement",
          titleField: "title",
          subtitleField: "dateAdded",
          fields: {
            title: { kind: "text", label: "Title", required: true },
            descriptionMdx: {
              kind: "markdown",
              label: "Message",
              required: true,
              rows: 6,
            },
            type: {
              kind: "select",
              label: "Style",
              options: ["info", "urgent"],
              required: true,
            },
            dateAdded: { kind: "date", label: "Date added", required: true },
            pin: {
              kind: "boolean",
              label: "Pin to the top",
              help: "Pinned announcements also show on the member dashboard.",
            },
          },
        },
      },
    },
  },
  memberResources: {
    id: "memberResources",
    label: "Member resources",
    description: "Quick links to files, forms, and folders for members.",
    icon: "book",
    scope: "members",
    previewPath: "/members/resources",
    defaults: memberResourcesDefaults,
    root: {
      kind: "object",
      label: "Resources",
      fields: {
        resources: {
          kind: "list",
          label: "Resources",
          itemLabel: "Resource",
          titleField: "title",
          fields: {
            title: { kind: "text", label: "Title", required: true },
            description: { kind: "textarea", label: "Description", rows: 2 },
            url: { kind: "url", label: "Link", required: true },
          },
        },
      },
    },
  },
};

export const CONTENT_COLLECTION_IDS = Object.keys(CONTENT_COLLECTIONS);

export function getCollectionSpec(id: string): CollectionSpec | undefined {
  return Object.prototype.hasOwnProperty.call(CONTENT_COLLECTIONS, id)
    ? CONTENT_COLLECTIONS[id]
    : undefined;
}

export function listCollectionSpecs(): CollectionSpec[] {
  return CONTENT_COLLECTION_IDS.map((id) => CONTENT_COLLECTIONS[id]);
}

export function getCollectionDefaults(id: string): unknown {
  const spec = getCollectionSpec(id);

  if (!spec) {
    return null;
  }

  return normalizeCollection(spec, spec.defaults);
}

/**
 * Strip the bundled defaults before handing a spec to the browser.
 */
export function toClientCollectionSpec(
  spec: CollectionSpec,
): ClientCollectionSpec {
  const { defaults: _defaults, ...clientSpec } = spec;
  return clientSpec;
}
