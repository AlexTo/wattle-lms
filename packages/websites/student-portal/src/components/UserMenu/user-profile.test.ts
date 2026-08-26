import type { User } from 'oidc-client-ts';
import { getUserIdentity } from './user-profile';

type UserProfile = User['profile'];

const profile = (claims: Partial<UserProfile>) => claims as UserProfile;

describe('getUserIdentity', () => {
  it('uses given and family names with both initials', () => {
    expect(
      getUserIdentity(
        profile({
          given_name: 'Ada',
          family_name: 'Lovelace',
          'cognito:username': 'ada123',
        }),
      ),
    ).toEqual({ displayName: 'Ada Lovelace', initials: 'AL' });
  });

  it('falls back to the Cognito username', () => {
    expect(
      getUserIdentity(profile({ 'cognito:username': 'student-one' })),
    ).toEqual({ displayName: 'student-one', initials: 'S' });
  });

  it('handles an unavailable profile', () => {
    expect(getUserIdentity(undefined)).toEqual({
      displayName: '',
      initials: '',
    });
  });
});
